"use client";

import { Component, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-[var(--color-error)]/20">
          <CardContent className="flex flex-col items-center gap-3 py-8">
            <AlertTriangle className="h-8 w-8 text-[var(--color-error)]" />
            <p className="text-sm text-[var(--color-text-secondary)]">
              {this.props.fallbackMessage ||
                "このセクションの読み込みに失敗しました"}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => this.setState({ hasError: false })}
            >
              再試行
            </Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}
