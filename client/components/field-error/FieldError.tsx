interface FieldErrorProps {
  message: string;
}

export function FieldError({ message }: FieldErrorProps) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-danger bg-danger/50 px-3 py-2 text-sm text-danger-foreground"
    >
      {message}
    </p>
  );
}
