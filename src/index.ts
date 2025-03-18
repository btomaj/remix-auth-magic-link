import crypto from "node:crypto";
import { type JWTPayload, SignJWT, jwtVerify } from "jose";
import { Strategy } from "remix-auth/strategy";

export class MagicLinkStrategy<User> extends Strategy<
  User,
  MagicLinkStrategy.VerifyOptions
> {
  name = "magic-link";

  constructor(
    protected options: MagicLinkStrategy.Options,
    verify: Strategy.VerifyFunction<User, MagicLinkStrategy.VerifyOptions>,
  ) {
    super(verify);
  }

  async authenticate(request: Request): Promise<User> {
    const url = new URL(request.url);
    const jwt = url.searchParams.get("token");
    const key = url.searchParams.get("key");

    if (jwt && !key) {
      throw new Error("Attempted to validate, but missing key in URL.");
    }

    if (!jwt && key) {
      throw new Error("Attempted to validate, but missing token in URL.");
    }

    // Generate a new token
    if (!jwt && !key) {
      const form = await request.clone().formData();

      const key = crypto.randomBytes(32);

      const token = await new SignJWT(Object.fromEntries(form))
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuedAt()
        .setExpirationTime(this.options.expiresIn || 5 * 60)
        .sign(key);

      return await this.verify({
        form,
        token,
        key: Buffer.from(key).toString("base64url"),
      });
    }

    // Validate the token
    if (jwt && key) {
      const { payload } = await jwtVerify(
        jwt,
        Uint8Array.from(Buffer.from(key, "base64url")),
        {
          clockTolerance: 10,
          maxTokenAge: this.options.expiresIn || 5 * 60,
        },
      );

      return await this.verify({
        form: payload,
        token: jwt,
      });
    }

    // Satisfying TypeScript. This should never happen.
    throw new Error("Unexpected state.");
  }
}

export namespace MagicLinkStrategy {
  /**
   * This interface declares what configuration the strategy needs from the
   * developer to correctly work.
   */
  export interface Options {
    expiresIn?: number; // in seconds, e.g. 5 * 60 for 5 minutes
  }

  interface GenerateOptions {
    form: FormData;
    token: string;
    key: string;
  }

  interface ValidateOptions {
    form: JWTPayload;
    token: string;
    key?: never;
  }

  /**
   * This interface declares what the developer will receive from the strategy
   * to verify the user identity in their system.
   */
  export type VerifyOptions = GenerateOptions | ValidateOptions;
}
