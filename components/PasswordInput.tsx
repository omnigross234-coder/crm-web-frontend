"use client";

import { InputHTMLAttributes, useState } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa";

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  wrapperClassName?: string;
}

/**
 * Password input with a show/hide toggle. Wraps the field in a relative
 * container and forces `w-full` so it fills the same space the caller's
 * bare `<input>` used to (including grid/flex layouts that relied on
 * stretch sizing), then appends right padding so typed text never runs
 * under the toggle button.
 */
export default function PasswordInput({
  className = "",
  wrapperClassName = "",
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`w-full pr-10 ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
        tabIndex={0}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
      >
        {visible ? <FaEyeSlash size={15} /> : <FaEye size={15} />}
      </button>
    </div>
  );
}
