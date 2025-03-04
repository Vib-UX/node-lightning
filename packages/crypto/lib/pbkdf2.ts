import crypto from "crypto";

export function pbkdf2(
    password: Buffer,
    salt: Buffer,
    iterations: number,
    keylen: number,
    hmac: string,
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, iterations, keylen, hmac, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
}
