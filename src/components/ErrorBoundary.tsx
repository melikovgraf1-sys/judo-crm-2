import React from "react";

type Props = {
  children: React.ReactNode,
};

type State = {
  hasError: boolean,
};

export default class ErrorBoundary extends React.Component<Props, State> {
  state = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Log error to console or send to a server
    console.error("ErrorBoundary caught an error", error, info);
    // Example: send to server (replace with real endpoint)
    // fetch("/log-error", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ error: error.toString(), info }),
    // });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-center text-red-700">
          <h1 className="text-lg font-semibold">Что-то пошло не так.</h1>
          <p>Пожалуйста, перезагрузите страницу или попробуйте позже.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
