#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""apk-sign-info.py —— 读出 APK 的「备案三件套」：包名 / 公钥 / MD5（含 SHA1、SHA256、证书信息）

用法:
    python3 tools/apk-sign-info.py <apk 路径> [更多 apk ...]
    python3 tools/apk-sign-info.py --json <apk 路径>      # 机器可读输出

为什么需要它:
    App 备案（工信部）要填「包名 + 公钥 + MD5」。keytool -printcert -jarfile 对只有 v2/v3 签名
    的包（Flutter/AGP 8 默认如此）会报 "Not a signed jar file"，所以这里直接解析
    APK Signing Block（v2/v3/v3.1），再用 openssl 复核，两条独立路径互相印证。

实现要点（踩过的坑）:
    · v1(JAR) 签名不存在时要走 v2/v3 签名块；签名块紧贴中央目录之前，末尾魔数 APK Sig Block 42
    · AndroidManifest.xml 是二进制 AXML，字符串池多为 UTF-16，直接正则搜包名会混进无关命名空间，
      所以这里正经解析 string pool + start-element 属性（package / versionName / versionCode）
    · openssl pkey 的 stdin 必须是 bytes，传 str 会 TypeError
    · 备案系统要的「公钥」是 SubjectPublicKeyInfo DER 的 Base64、单行不换行；
      「MD5」是大写、无冒号
"""
import base64
import hashlib
import json
import pathlib
import struct
import subprocess
import sys

V2_ID, V3_ID, V31_ID = 0x7109871A, 0xF05368C0, 0x1B93AD61


# ---------------------------------------------------------------- AXML 解析
def axml_strings(buf):
    """解析 AXML 的字符串池，返回 (strings, chunk_offsets)"""
    assert struct.unpack_from("<H", buf, 0)[0] == 0x0003, "不是 AXML（chunk type 不是 XML）"
    off = struct.unpack_from("<H", buf, 2)[0]  # header size
    while off < len(buf):
        ctype, hsize, csize = struct.unpack_from("<HHI", buf, off)
        if ctype == 0x0001:  # string pool
            n, style_n, flags, strings_start, styles_start = struct.unpack_from("<IIIII", buf, off + 8)
            utf8 = bool(flags & 0x100)
            idx_off = off + hsize
            out = []
            base = off + strings_start
            for i in range(n):
                p = base + struct.unpack_from("<I", buf, idx_off + 4 * i)[0]
                if utf8:
                    # 1~2 字节的字符数，再 1~2 字节的字节数
                    ln = buf[p]
                    p += 2 if ln & 0x80 else 1
                    blen = buf[p]
                    if blen & 0x80:
                        blen = ((blen & 0x7F) << 8) | buf[p + 1]
                        p += 2
                    else:
                        p += 1
                    out.append(buf[p:p + blen].decode("utf-8", "replace"))
                else:
                    ln = struct.unpack_from("<H", buf, p)[0]
                    p += 2
                    if ln & 0x8000:
                        ln = ((ln & 0x7FFF) << 16) | struct.unpack_from("<H", buf, p)[0]
                        p += 2
                    out.append(buf[p:p + 2 * ln].decode("utf-16-le", "replace"))
            return out, off + csize
        off += csize
    raise ValueError("AXML 里找不到字符串池")


def axml_manifest_attrs(buf):
    """取 <manifest> 元素上的属性（package / versionName / versionCode 等）"""
    strings, off = axml_strings(buf)
    S = lambda i: strings[i] if 0 <= i < len(strings) else None
    while off < len(buf):
        ctype, hsize, csize = struct.unpack_from("<HHI", buf, off)
        if ctype == 0x0102:  # START_ELEMENT
            name_idx = struct.unpack_from("<I", buf, off + 20)[0]
            attr_start = struct.unpack_from("<H", buf, off + 24)[0]
            attr_size = struct.unpack_from("<H", buf, off + 26)[0]
            attr_count = struct.unpack_from("<H", buf, off + 28)[0]
            tag = S(name_idx)
            attrs = {}
            for a in range(attr_count):
                p = off + 16 + attr_start + a * attr_size
                ns_idx, an_idx, raw_idx = struct.unpack_from("<III", buf, p)
                if raw_idx != 0xFFFFFFFF:
                    attrs[S(an_idx) or f"attr{an_idx}"] = S(raw_idx)
                else:  # 类型化值（如 versionCode 是整型）
                    dtype = buf[p + 15]
                    data = struct.unpack_from("<I", buf, p + 16)[0]
                    attrs[S(an_idx) or f"attr{an_idx}"] = data if dtype == 0x10 else data
            if tag == "manifest":
                return attrs
        if csize == 0:
            break
        off += csize
    return {}


# ---------------------------------------------------------------- 签名块
def lp(buf, off):
    n = struct.unpack_from("<I", buf, off)[0]
    return buf[off + 4: off + 4 + n], off + 4 + n


def signing_block_pairs(data):
    eocd = data.rfind(b"PK\x05\x06")
    if eocd < 0:
        raise ValueError("找不到 EOCD，文件可能不是 zip/apk")
    cd_off = struct.unpack_from("<I", data, eocd + 16)[0]
    if data[cd_off - 16: cd_off] != b"APK Sig Block 42":
        return {}
    size_block = struct.unpack_from("<Q", data, cd_off - 24)[0]
    p, end, pairs = cd_off - size_block - 8 + 8, cd_off - 24, {}
    while p < end:
        ln = struct.unpack_from("<Q", data, p)[0]
        pid = struct.unpack_from("<I", data, p + 8)[0]
        pairs[pid] = data[p + 12: p + 8 + ln]
        p += 8 + ln
    return pairs


def certs_from_block(pairs):
    """返回 (scheme 名称, [证书 DER, ...])"""
    for pid, label in ((V31_ID, "v3.1"), (V3_ID, "v3"), (V2_ID, "v2")):
        blob = pairs.get(pid)
        if not blob:
            continue
        signers, _ = lp(blob, 0)
        signer, _ = lp(signers, 0)
        signed, _ = lp(signer, 0)
        # signed data: [digests][certificates][...]，v3 后面还有 min/maxSdk
        _, o = lp(signed, 0)          # digests
        certseq, _ = lp(signed, o)    # certificates
        out, o = [], 0
        while o < len(certseq):
            c, o = lp(certseq, o)
            out.append(c)
        if out:
            return label, out
    return None, []


def certs_from_v1(apk_path):
    """v1(JAR) 签名的证书（openssl 解 PKCS#7）"""
    import zipfile
    with zipfile.ZipFile(apk_path) as zf:
        names = [n for n in zf.namelist()
                 if n.startswith("META-INF/") and n.split(".")[-1].upper() in ("RSA", "DSA", "EC")]
        out = []
        for n in names:
            der = zf.read(n)
            pem = subprocess.run(["openssl", "pkcs7", "-inform", "DER", "-print_certs"],
                                 input=der, capture_output=True).stdout
            if pem.strip():
                d = subprocess.run(["openssl", "x509", "-outform", "DER"], input=pem,
                                   capture_output=True).stdout
                if d:
                    out.append(d)
        return out


def cert_info(der):
    """MD5 / SHA1 / SHA256 / 公钥(Base64) / 主体 / 有效期"""
    def o(args, inp=None):
        return subprocess.run(["openssl"] + args, input=inp, capture_output=True).stdout

    tmp = pathlib.Path("/tmp/_apk_cert.der")
    tmp.write_bytes(der)
    subj = o(["x509", "-inform", "DER", "-in", str(tmp), "-noout", "-subject", "-dates", "-serial"]).decode()
    spki_pem = o(["x509", "-inform", "DER", "-in", str(tmp), "-pubkey", "-noout"])
    spki_der = o(["pkey", "-pubin", "-outform", "DER"], spki_pem)
    fields = {}
    for line in subj.splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            fields[k.strip()] = v.strip()
    return {
        "md5": hashlib.md5(der).hexdigest().upper(),
        "sha1": hashlib.sha1(der).hexdigest().upper(),
        "sha256": hashlib.sha256(der).hexdigest().upper(),
        "public_key_b64": base64.b64encode(spki_der).decode(),
        "subject": fields.get("subject", ""),
        "issuer": fields.get("issuer", ""),
        "not_before": fields.get("notBefore", ""),
        "not_after": fields.get("notAfter", ""),
        "serial": fields.get("serial", ""),
        "key_type": "RSA" if b"rsaEncryption" in o(["x509", "-inform", "DER", "-in", str(tmp), "-noout", "-text"])[:400] else "非RSA",
    }


def inspect(apk):
    path = pathlib.Path(apk)
    data = path.read_bytes()
    import zipfile
    with zipfile.ZipFile(path) as zf:
        manifest = zf.read("AndroidManifest.xml")
    attrs = axml_manifest_attrs(manifest)

    pairs = signing_block_pairs(data)
    scheme, ders = certs_from_block(pairs)
    if not ders:
        ders = certs_from_v1(path)
        scheme = "v1(JAR)" if ders else "未签名"

    info = {
        "file": str(path),
        "size_bytes": len(data),
        "size_mb": round(len(data) / 1048576, 1),
        "package": attrs.get("package"),
        "versionName": attrs.get("versionName"),
        "versionCode": attrs.get("versionCode"),
        "signature_scheme": scheme,
        "schemes_present": [n for k, n in ((V2_ID, "v2"), (V3_ID, "v3"), (V31_ID, "v3.1")) if k in pairs],
        "cert_count": len(ders),
    }
    if ders:
        info.update(cert_info(ders[0]))
    return info


def report(i):
    print("=" * 78)
    print(f"文件        : {i['file']}")
    print(f"大小        : {i['size_mb']} MB ({i['size_bytes']} 字节)")
    print(f"包名        : {i['package']}")
    print(f"版本        : versionName={i['versionName']}  versionCode={i['versionCode']}")
    print(f"签名方案    : {i['signature_scheme']}  (块内: {i['schemes_present'] or '无'})  证书 {i['cert_count']} 张")
    if "md5" in i:
        print(f"证书主体    : {i['subject']}")
        print(f"有效期      : {i['not_before']} → {i['not_after']}")
        print("-" * 78)
        print("备案三件套（可直接粘贴）")
        print(f"  包名      : {i['package']}")
        print(f"  MD5       : {i['md5']}")
        print(f"  公钥      : {i['public_key_b64']}")
        print("-" * 78)
        print(f"  SHA1      : {i['sha1']}")
        print(f"  SHA256    : {i['sha256']}")
        print(f"  MD5(冒号) : {':'.join(i['md5'][x:x+2] for x in range(0, 32, 2))}")


def main():
    args = [a for a in sys.argv[1:] if a != "--json"]
    as_json = "--json" in sys.argv
    if not args:
        sys.exit(__doc__)
    results = [inspect(a) for a in args]
    if as_json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        for i in results:
            report(i)
        if len(results) > 1:
            print("\n== 各包 MD5 对比（判断是否同一签名证书）==")
            for i in results:
                print(f"  {pathlib.Path(i['file']).name:48s} {i.get('md5', '未签名')}")


if __name__ == "__main__":
    main()
