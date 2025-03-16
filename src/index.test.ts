import { jwtVerify } from "jose";
import { type Mock, beforeEach, describe, expect, test, vi } from "vitest";
import { MagicLinkStrategy } from "./index";

// Mock dependencies
vi.mock("remix-auth", () => ({
  authenticator: {
    authenticate: vi.fn(),
  },
}));

const mockSignJWT = {
  setProtectedHeader: vi.fn().mockReturnThis(),
  setIssuedAt: vi.fn().mockReturnThis(),
  setExpirationTime: vi.fn().mockReturnThis(),
  sign: vi.fn().mockResolvedValue("mock-token"),
};
vi.mock("jose", () => ({
  jwtVerify: vi.fn(),
  SignJWT: vi.fn().mockImplementation(() => ({
    setProtectedHeader: mockSignJWT.setProtectedHeader,
    setIssuedAt: mockSignJWT.setIssuedAt,
    setExpirationTime: mockSignJWT.setExpirationTime,
    sign: mockSignJWT.sign,
  })),
}));

vi.mock("node:crypto", () => ({
  default: {
    randomBytes: vi.fn().mockReturnValue(Buffer.from("mock-random-bytes")),
  },
}));

describe("MagicLinkStrategy", () => {
  let strategy: MagicLinkStrategy<{ id: string }>;
  let verifyFn: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    verifyFn = vi.fn();
    strategy = new MagicLinkStrategy({}, verifyFn);
  });

  test("should have the correct name", () => {
    expect(strategy.name).toBe("magic-link");
  });

  test("should generate a token when email is provided in form data", async () => {
    const formData = new FormData();
    formData.append("email", "user@example.com");

    const request = new Request("https://example.com", {
      method: "POST",
      body: formData,
    });

    await strategy.authenticate(request);

    expect(verifyFn).toHaveBeenCalledWith({
      token: "mock-token", // from jose mock
      key: expect.any(String),
    });
  });

  test("should throw error for invalid email", async () => {
    const formData = new FormData();
    formData.append("email", "invalid-email");

    const request = new Request("https://example.com", {
      method: "POST",
      body: formData,
    });

    await expect(strategy.authenticate(request)).rejects.toThrow();
  });

  test("should throw error for email that fails validation", async () => {
    const strategyWithEmailValidation = new MagicLinkStrategy(
      {
        validateEmail: (email) => email.endsWith("@example.com"),
      },
      verifyFn,
    );
    const formData = new FormData();
    formData.append("email", "user@invalid-domain.com");

    const request = new Request("https://example.com", {
      method: "POST",
      body: formData,
    });

    await expect(
      strategyWithEmailValidation.authenticate(request),
    ).rejects.toThrow();
  });

  test("should throw error when token is present but key is missing", async () => {
    const request = new Request("https://example.com?token=valid-token");

    await expect(strategy.authenticate(request)).rejects.toThrow(
      "Missing signing key in URL.",
    );
  });

  test("should verify token when provided in URL", async () => {
    const request = new Request(
      "https://example.com?token=valid-token&key=valid-key",
    );

    (jwtVerify as Mock).mockResolvedValue({
      payload: { email: "user@example.com" },
    });

    await strategy.authenticate(request);

    expect(jwtVerify).toHaveBeenCalledWith(
      "valid-token",
      expect.any(Uint8Array),
      expect.any(Object),
    );
  });

  test("should use expiration time when provided", async () => {
    const strategyWithExpiry = new MagicLinkStrategy(
      {
        expiresIn: 3, // 3 seconds
      },
      verifyFn,
    );
    const formData = new FormData();
    formData.append("email", "user@example.com");

    const request = new Request("https://example.com", {
      method: "POST",
      body: formData,
    });

    await strategyWithExpiry.authenticate(request);

    // Default expiry is 5 * 60 = 300 seconds
    expect(mockSignJWT.setExpirationTime).toHaveBeenCalledWith(3);
  });

  test("should use default expiration time when not provided", async () => {
    const formData = new FormData();
    formData.append("email", "user@example.com");

    const request = new Request("https://example.com", {
      method: "POST",
      body: formData,
    });

    await strategy.authenticate(request);

    // Default expiry is 5 * 60 = 300 seconds
    expect(mockSignJWT.setExpirationTime).toHaveBeenCalledWith(300);
  });
});
