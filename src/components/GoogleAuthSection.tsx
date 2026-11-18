"use client";

// Firebase Google 登录已在迁移到腾讯云 CloudBase 时停用（CloudBase 无对应能力）。
// 保留原代码以备后续恢复或替换为其他登录方式。

// import { useState } from "react";
// import { useRouter } from "next/navigation";
// import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
// import { auth, isFirebaseConfigured } from "@/lib/firebase";
// import { Notice, resolveNextPath } from "./auth-utils";

// interface GoogleAuthSectionProps {
//   nextPath: string;
// }

export function GoogleAuthSection(_props: { nextPath: string }) {
  // const router = useRouter();
  // const [notice, setNotice] = useState<Notice>(null);
  // const [pending, setPending] = useState<boolean>(false);

  // async function loginWithGoogle() {
  //   if (!isFirebaseConfigured() || !auth) {
  //     setNotice({ type: "error", text: "尚未配置 Firebase 环境变量，请先完成本地配置。" });
  //     return;
  //   }
  //   setPending(true);
  //   setNotice(null);
  //   try {
  //     await signInWithPopup(auth!, new GoogleAuthProvider());
  //     router.push(await resolveNextPath(nextPath));
  //     router.refresh();
  //   } catch {
  //     setNotice({ type: "error", text: "Google 登录失败，请稍后重试。" });
  //   } finally {
  //     setPending(false);
  //   }
  // }

  return null;
}
