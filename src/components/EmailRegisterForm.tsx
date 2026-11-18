"use client";

import { FormEvent, useRef, useState } from "react";
import { getCbAuth } from "@/lib/cloudbase";
import { Notice, canSubmit } from "./auth-utils";

interface EmailRegisterFormProps {
  nextPath: string;
}

type RegisterStep = "credentials" | "otp" | "done";

export function EmailRegisterForm({ nextPath }: EmailRegisterFormProps) {
  void nextPath;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [step, setStep] = useState<RegisterStep>("credentials");
  const [notice, setNotice] = useState<Notice>(null);
  const [pending, setPending] = useState<boolean>(false);
  const verifyOtpRef = useRef<((params: { token: string }) => Promise<{ error?: unknown }>) | null>(null);

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit(email, password, setNotice)) {
      return;
    }
    setPending(true);
    setNotice(null);
    try {
      const auth = getCbAuth();
      if (!auth) {
        setNotice({ type: "error", text: "CloudBase 未配置，无法注册。" });
        return;
      }
      const result = (await auth.signUpWithEmailAndPassword(email.trim(), password)) as { data?: { verifyOtp?: unknown } | null; error?: unknown };
      const error = result?.error;
      if (error) {
        throw error;
      }
      const verifyOtp = result?.data?.verifyOtp;
      if (typeof verifyOtp !== "function") {
        // 部分环境无验证码环节，直接完成注册
        setNotice({ type: "success", text: "注册成功，请切换到登录。" });
        setStep("done");
        return;
      }
      verifyOtpRef.current = verifyOtp as (params: { token: string }) => Promise<{ error?: unknown }>;
      setStep("otp");
      setNotice({ type: "success", text: "验证码已发送至邮箱，请输入收到的验证码完成注册。" });
    } catch (error) {
      const code = typeof error === "object" && error !== null
        ? String((error as { error?: unknown }).error ?? (error as { code?: unknown }).code ?? "")
        : "";
      setNotice({
        type: "error",
        text: code.includes("EMAIL_EXISTS") || code.includes("email_already_in_use")
          ? "该账号已注册，请登录。"
          : "注册失败。请检查网络或邮箱格式后重试。",
      });
    } finally {
      setPending(false);
    }
  }

  async function confirmOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = otpCode.trim();
    if (!code) {
      setNotice({ type: "error", text: "请输入验证码。" });
      return;
    }
    const verifyOtp = verifyOtpRef.current;
    if (!verifyOtp) {
      setStep("credentials");
      return;
    }
    setPending(true);
    setNotice(null);
    try {
      const result = await verifyOtp({ token: code });
      const error = result?.error;
      if (error) {
        throw error;
      }
      setNotice({ type: "success", text: "注册成功，请使用邮箱登录。" });
      setStep("done");
    } catch {
      setNotice({ type: "error", text: "验证码无效或已过期，请重新获取。" });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={step === "otp" ? confirmOtp : register} className="space-y-4 rounded-2xl border border-indigo-100 bg-white/72 p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">邮箱注册</h2>
      {notice && (
        <p
          role="alert"
          className={`rounded-xl px-4 py-3 text-sm leading-6 ${
            notice.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
          }`}
        >
          {notice.text}
        </p>
      )}
      {step === "credentials" && (
        <>
          <div>
            <label htmlFor="email-register" className="mb-2 block text-sm font-semibold text-slate-700">邮箱</label>
            <input
              id="email-register"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-indigo-500"
              placeholder="name@example.com"
              type="email"
              autoComplete="email"
            />
          </div>
          <div>
            <label htmlFor="password-register" className="mb-2 block text-sm font-semibold text-slate-700">密码</label>
            <input
              id="password-register"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-indigo-500"
              placeholder="密码（至少 6 位）"
              type="password"
              autoComplete="new-password"
            />
          </div>
          <button type="submit" disabled={pending} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm disabled:opacity-60">
            {pending ? "注册中..." : "邮箱注册"}
          </button>
        </>
      )}
      {step === "otp" && (
        <>
          <div>
            <label htmlFor="otp-register" className="mb-2 block text-sm font-semibold text-slate-700">邮箱验证码</label>
            <input
              id="otp-register"
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-indigo-500"
              placeholder="输入邮箱收到的验证码"
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </div>
          <button type="submit" disabled={pending} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm disabled:opacity-60">
            {pending ? "验证中..." : "完成注册"}
          </button>
        </>
      )}
      {step === "done" && (
        <p className="text-sm leading-6 text-slate-600">注册已完成，请在左侧使用邮箱登录。</p>
      )}
    </form>
  );
}
