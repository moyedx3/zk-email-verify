import { pki } from "node-forge";
import { DkimVerifier } from "./mailauth/dkim-verifier";
import { writeToStream } from "./mailauth/tools";
import sanitizers from "./sanitizers";

export interface DKIMVerificationResult {
  publicKey: bigint;
  signature: bigint;
  headers: Buffer;
  body: Buffer;
  bodyHash: string;
  signingDomain: string;
  selector: string;
  algo: string;
  format: string;
  modulusLength: number;
  appliedSanitization?: string;
}

/**
 * 
 * @param email Entire email data as a string or buffer
 * @param domain Domain to verify DKIM signature for. If not provided, the domain is extracted from the `From` header
 * @param enableSanitization If true, email will be applied with various sanitization to try and pass DKIM verification
 * @returns 
 */
export async function verifyDKIMSignature(
  email: Buffer | string,
  domain: string = "",
  enableSanitization: boolean = true
): Promise<DKIMVerificationResult> {
  const emailStr = email.toString();

  const pgpMarkers = ["BEGIN PGP MESSAGE", "BEGIN PGP SIGNED MESSAGE"];

  const isPGPEncoded = pgpMarkers.some((marker) => emailStr.includes(marker));
  if (isPGPEncoded) {
    throw new Error("PGP encoded emails are not supported.");
  }

  let dkimResult = await tryVerifyDKIM(email, domain);

  // If DKIM verification fails, try again after sanitizing email
  let appliedSanitization;
  if (dkimResult.status.comment === "bad signature" && enableSanitization) {
    const results = await Promise.all(
      sanitizers.map((sanitize) =>
        tryVerifyDKIM(sanitize(emailStr), domain).then((result) => ({
          result,
          sanitizer: sanitize.name,
        }))
      )
    );

    const passed = results.find((r) => r.result.status.result === "pass");

    if (passed) {
      console.log(
        `DKIM: Verification passed after applying sanitization "${passed.sanitizer}"`
      );
      dkimResult = passed.result;
      appliedSanitization = passed.sanitizer;
    }
  }

  const {
    status: { result, comment },
    signingDomain,
    publicKey,
    signature,
    status,
    body,
    bodyHash,
  } = dkimResult;

  if (result !== "pass") {
    throw new Error(
      `DKIM signature verification failed for domain ${signingDomain}. Reason: ${comment}`
    );
  }

  const pubKeyData = pki.publicKeyFromPem(publicKey.toString());

  return {
    signature: BigInt("0x" + Buffer.from(signature, "base64").toString("hex")),
    headers: status.signature_header,
    body: body,
    bodyHash: bodyHash,
    signingDomain: dkimResult.signingDomain,
    publicKey: BigInt(pubKeyData.n.toString()),
    selector: dkimResult.selector,
    algo: dkimResult.algo,
    format: dkimResult.format,
    modulusLength: dkimResult.modulusLength,
    appliedSanitization,
  };
}

async function tryVerifyDKIM(email: Buffer | string, domain: string = "") {
  let dkimVerifier = new DkimVerifier({});
  await writeToStream(dkimVerifier, email as any);

  let domainToVerifyDKIM = domain;
  if (!domainToVerifyDKIM) {
    if (dkimVerifier.headerFrom.length > 1) {
      throw new Error(
        "Multiple From header in email and domain for verification not specified"
      );
    }

    domainToVerifyDKIM = dkimVerifier.headerFrom[0].split("@")[1];
  }

  const dkimResult = dkimVerifier.results.find(
    (d: any) => d.signingDomain === domainToVerifyDKIM
  );

  if (!dkimResult) {
    throw new Error(
      `DKIM signature not found for domain ${domainToVerifyDKIM}`
    );
  }

  if (dkimVerifier.headers) {
    Object.defineProperty(dkimResult, "headers", {
      enumerable: false,
      configurable: false,
      writable: false,
      value: dkimVerifier.headers,
    });
  }

  return dkimResult;
}
