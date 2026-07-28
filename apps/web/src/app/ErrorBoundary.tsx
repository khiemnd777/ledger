import { Button } from "@pocket/ui";
import { CircleAlert, RefreshCw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error?: Error;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("SỔ TAY render error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="fatal-error">
        <span>
          <CircleAlert />
        </span>
        <h1>SỔ TAY chưa thể mở màn hình này</h1>
        <p>
          Dữ liệu trên thiết bị vẫn được giữ nguyên. Hãy tải lại ứng dụng để thử khôi phục giao
          diện.
        </p>
        {import.meta.env.DEV && <pre>{this.state.error.stack}</pre>}
        <Button onClick={() => location.reload()}>
          <RefreshCw />
          Tải lại ứng dụng
        </Button>
      </main>
    );
  }
}
