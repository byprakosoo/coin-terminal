import { describe, expect, it } from "vitest";
import {
  REMEMBERED_ACCOUNT_COOKIE,
  parseRememberedAccountCookie,
} from "@/lib/remembered-account";

describe("remembered account cookie", () => {
  it("reads an encoded email without confusing similarly named cookies", () => {
    const cookies = `other=${REMEMBERED_ACCOUNT_COOKIE}=no; ${REMEMBERED_ACCOUNT_COOKIE}=bayu%40example.com; theme=dark`;

    expect(parseRememberedAccountCookie(cookies)).toBe("bayu@example.com");
  });

  it("ignores missing or malformed values", () => {
    expect(parseRememberedAccountCookie("theme=dark")).toBeUndefined();
    expect(parseRememberedAccountCookie(`${REMEMBERED_ACCOUNT_COOKIE}=%E0%A4%A`)).toBeUndefined();
    expect(parseRememberedAccountCookie(`${REMEMBERED_ACCOUNT_COOKIE}=`)).toBeUndefined();
  });
});
