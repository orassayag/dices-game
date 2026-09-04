interface FieldErrorProps {
  message: string;
}

/** Inline validation error shown directly under the field it belongs to — a soft red
 * banner (not the browser's floating native-validation bubble) so the failure reads in
 * context instead of popping over the form. */
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
