import { authApi } from "@pocket/firebase";
import { Button } from "@pocket/ui";
import { ArrowRight, Check, KeyRound, Mail, ScanLine, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../../app/AuthContext";
import { toVietnameseError } from "../../app/format";
import { Field } from "../../components/Ui";

const schema = z.object({
  email: z.string().email("Email chưa đúng định dạng"),
  password: z.string().min(6, "Mật khẩu cần ít nhất 6 ký tự"),
});

export default function AuthPage() {
  const { user, firebaseEnabled, continueLocal } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "forgot") {
        const parsed = z.string().email("Email chưa đúng định dạng").parse(email);
        await authApi.resetPassword(parsed);
        setNotice("Đã gửi email đặt lại mật khẩu.");
      } else {
        const parsed = schema.parse({ email, password });
        if (mode === "signup") await authApi.signUpEmail(parsed.email, parsed.password);
        else await authApi.signInEmail(parsed.email, parsed.password);
        navigate("/");
      }
    } catch (cause) {
      setError(
        cause instanceof z.ZodError
          ? (cause.issues[0]?.message ?? "Dữ liệu chưa hợp lệ")
          : toVietnameseError(cause),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-hero">
        <div className="auth-brand">
          <span>PO</span>
          <strong>SỔ TAY</strong>
        </div>
        <div>
          <p className="eyebrow eyebrow--light">BÁN ÁO NHẸ TÊNH</p>
          <h1>
            Một lần quét.
            <br />
            Kho áo rõ ràng.
          </h1>
          <p>Quản lý bán áo bằng QR ngay trên điện thoại — kể cả khi mất mạng.</p>
        </div>
        <ul>
          <li>
            <ScanLine />
            <span>
              <strong>Quét đúng biến thể</strong>
              <small>Size, màu, kiểu cổ — không xuất nhầm</small>
            </span>
          </li>
          <li>
            <ShieldCheck />
            <span>
              <strong>Dữ liệu của riêng bạn</strong>
              <small>Lưu tại máy, sao lưu an toàn</small>
            </span>
          </li>
        </ul>
      </section>
      <main className="auth-panel">
        <div className="auth-panel__heading">
          <h2>
            {mode === "signin"
              ? "Chào bạn quay lại"
              : mode === "signup"
                ? "Tạo tài khoản SỔ TAY"
                : "Lấy lại mật khẩu"}
          </h2>
          <p>
            {mode === "forgot"
              ? "Nhập email để nhận liên kết đặt lại mật khẩu."
              : "Bắt đầu ngày bán hàng gọn gàng hơn."}
          </p>
        </div>
        {firebaseEnabled ? (
          <>
            {mode !== "forgot" && (
              <Button
                variant="secondary"
                className="google-button"
                onClick={async () => {
                  try {
                    await authApi.signInGoogle();
                    navigate("/");
                  } catch (cause) {
                    setError(toVietnameseError(cause));
                  }
                }}
              >
                <span className="google-mark">G</span> Tiếp tục với Google
              </Button>
            )}
            {mode !== "forgot" && (
              <div className="divider">
                <span>hoặc dùng email</span>
              </div>
            )}
            <form onSubmit={submit}>
              <Field label="Email">
                <div className="input-with-icon">
                  <Mail />
                  <input
                    autoComplete="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ban@shop.vn"
                  />
                </div>
              </Field>
              {mode !== "forgot" && (
                <Field label="Mật khẩu">
                  <div className="input-with-icon">
                    <KeyRound />
                    <input
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Từ 6 ký tự"
                    />
                  </div>
                </Field>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              {notice && (
                <p className="form-success">
                  <Check />
                  {notice}
                </p>
              )}
              <Button disabled={busy} type="submit">
                {busy
                  ? "Đang xử lý…"
                  : mode === "signin"
                    ? "Đăng nhập"
                    : mode === "signup"
                      ? "Tạo tài khoản"
                      : "Gửi liên kết"}
                <ArrowRight />
              </Button>
            </form>
            <div className="auth-links">
              {mode === "signin" && (
                <button type="button" onClick={() => setMode("forgot")}>
                  Quên mật khẩu?
                </button>
              )}
              <button
                type="button"
                onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              >
                {mode === "signup" ? "Đã có tài khoản? Đăng nhập" : "Chưa có tài khoản? Đăng ký"}
              </button>
            </div>
          </>
        ) : (
          <div className="local-mode">
            <span className="local-mode__icon">
              <ShieldCheck />
            </span>
            <h3>Chế độ phát triển cục bộ</h3>
            <p>
              Firebase chưa được cấu hình. Bạn vẫn có thể sử dụng toàn bộ luồng bán hàng và dữ liệu
              sẽ được lưu trên thiết bị này.
            </p>
            <Button
              onClick={() => {
                continueLocal();
                navigate("/");
              }}
            >
              Mở SỔ TAY trên thiết bị này <ArrowRight />
            </Button>
            <small>Chế độ này tự tắt khi thêm cấu hình Firebase.</small>
          </div>
        )}
        <p className="auth-terms">
          Bằng cách tiếp tục, bạn đồng ý bảo vệ thông tin bán hàng và khách hàng của mình.
        </p>
      </main>
    </div>
  );
}
