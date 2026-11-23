import { describe, expect, it } from "vitest";
import { isPlausibleEmail, passwordProblem } from "@/lib/auth/password";

describe("política de senha", () => {
  it("exige 10+ caracteres com letras e números", () => {
    expect(passwordProblem("curta1")).toMatch(/10 caracteres/);
    expect(passwordProblem("somenteletras")).toMatch(/letras e números/);
    expect(passwordProblem("1234567890")).toMatch(/letras e números/);
    expect(passwordProblem("senhaboa123")).toBeNull();
    expect(passwordProblem("çãoéàü12345")).toBeNull();
  });

  it("confere a confirmação", () => {
    expect(passwordProblem("senhaboa123", "senhaboa124")).toMatch(/não conferem/);
    expect(passwordProblem("senhaboa123", "senhaboa123")).toBeNull();
  });

  it("respeita o limite de 72 bytes do Supabase", () => {
    expect(passwordProblem("a1".repeat(40))).toMatch(/longa/);
  });

  it("e-mail plausível", () => {
    expect(isPlausibleEmail("pessoa@agencia.com.br")).toBe(true);
    expect(isPlausibleEmail("sem-arroba")).toBe(false);
    expect(isPlausibleEmail("a b@c.com")).toBe(false);
  });
});

