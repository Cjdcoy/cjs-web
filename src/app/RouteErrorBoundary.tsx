import { Component, type ReactNode } from "react";
import { Button, ErrorState } from "../components/ui";
import { markNavigationComplete } from "../lib/routing";

interface RouteErrorBoundaryProps {
  children: ReactNode;
  resetKey: string;
}

interface RouteErrorBoundaryState {
  failed: boolean;
}

export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  state: RouteErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): RouteErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(): void {
    markNavigationComplete();
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("#main-content")?.focus();
    });
  }

  componentDidUpdate(previousProps: RouteErrorBoundaryProps): void {
    if (this.state.failed && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <ErrorState
          title="Page failed to load"
          description="The page code could not be loaded. Reload to request the current version."
          action={<Button onClick={() => window.location.reload()}>Reload page</Button>}
        />
      );
    }

    return this.props.children;
  }
}
