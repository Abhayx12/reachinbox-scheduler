import { API_BASE } from "@/lib/api";
import { useRouter } from "next/router";

export default function Login() {
  const router = useRouter();
  const authFailed = router.query.error === "auth_failed";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm rounded-lg border border-line p-8 text-center">
        <h1 className="mb-6 text-2xl font-semibold text-ink">Login</h1>

        {authFailed && (
          <p className="mb-4 rounded bg-signal-failedBg px-3 py-2 text-xs text-signal-failed">
            Sign-in failed. Please try again.
          </p>
        )}

        <a
          href={`${API_BASE}/api/auth/google`}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accentBg px-4 py-3 text-sm font-medium text-ink hover:bg-accentBg/70"
        >
          <GoogleIcon />
          Login with Google
        </a>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-line" />
          <span className="text-xs text-muted">or sign up through email</span>
          <div className="h-px flex-1 bg-line" />
        </div>

        <input
          disabled
          placeholder="Email ID"
          title="This build uses Google Sign-In only"
          className="mb-3 w-full rounded-lg bg-paper px-4 py-3 text-sm text-muted outline-none"
        />
        <input
          disabled
          type="password"
          placeholder="Password"
          title="This build uses Google Sign-In only"
          className="mb-5 w-full rounded-lg bg-paper px-4 py-3 text-sm text-muted outline-none"
        />

        <a
          href={`${API_BASE}/api/auth/google`}
          className="block w-full rounded-lg bg-accent py-3 text-sm font-semibold text-white hover:bg-accentDark"
        >
          Login
        </a>
        <p className="mt-3 text-xs text-muted">
          Email/password sign-up isn't wired up in this build — use Google above.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.9 32.9 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4c-7.7 0-14.3 4.3-17.7 10.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.3 0 10.1-2 13.7-5.3l-6.3-5.3C29.3 35 26.8 36 24 36c-5.3 0-9.8-3.1-11.3-7.4l-6.5 5C9.6 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.7 2.2-2.1 4.1-3.9 5.4l6.3 5.3C41.6 35.6 44 30.3 44 24c0-1.3-.1-2.7-.4-3.5z"
      />
    </svg>
  );
}
