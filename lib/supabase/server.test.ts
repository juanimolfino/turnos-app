import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieSet: vi.fn(),
  createServerClient: vi.fn((_url: string, _key: string, options: unknown) => ({ options }))
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [{ name: "sb-session", value: "old-session" }],
    set: (...args: unknown[]) => mocks.cookieSet(...args)
  })
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: [string, string, unknown]) => mocks.createServerClient(...args)
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn()
}));

import { createSupabaseReadOnlyServerClient, createSupabaseServerClient } from "./server";

type CookieAdapter = {
  cookies: {
    setAll: (cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => void;
  };
};

function lastCookieAdapter() {
  const calls = mocks.createServerClient.mock.calls;
  return calls[calls.length - 1][2] as CookieAdapter;
}

describe("Supabase server clients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("keeps the Server Component client read-only for cookie writes", async () => {
    await createSupabaseReadOnlyServerClient();

    lastCookieAdapter().cookies.setAll([
      { name: "sb-session", value: "new-session", options: { httpOnly: true } }
    ]);

    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("keeps the Route Handler client able to write refreshed session cookies", async () => {
    await createSupabaseServerClient();

    lastCookieAdapter().cookies.setAll([
      { name: "sb-session", value: "new-session", options: { httpOnly: true } }
    ]);

    expect(mocks.cookieSet).toHaveBeenCalledWith("sb-session", "new-session", {
      httpOnly: true,
      path: "/"
    });
  });
});
