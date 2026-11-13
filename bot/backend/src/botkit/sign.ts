/** 目录签名：Ed25519。公钥内置在 App 里（或由 AMB_CATALOG_PUBKEY 指定），私钥只在发布环境。 */
import crypto from "node:crypto";

export function generateCatalogKeys(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
  };
}

export function signCatalog(data: Buffer, privateKey: string): string {
  const key = crypto.createPrivateKey({ key: Buffer.from(privateKey, "base64"), type: "pkcs8", format: "der" });
  return crypto.sign(null, data, key).toString("base64");
}

/** 公钥或签名格式不对也算验签失败 */
export function verifyCatalog(data: Buffer, signature: string, publicKey: string): boolean {
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(publicKey, "base64"), type: "spki", format: "der" });
    return crypto.verify(null, data, key, Buffer.from(signature.trim(), "base64"));
  } catch {
    return false;
  }
}
