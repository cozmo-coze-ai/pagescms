"use client";

import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const EditComponent = forwardRef((props: any, ref: React.Ref<HTMLTextAreaElement>) => {
  const { field, ...restProps } = props;
  const placeholder = typeof field?.options?.placeholder === "string" ? field.options.placeholder : undefined;

  // `options.wrap`: long values wrap onto new lines (auto-growing textarea)
  // instead of scrolling horizontally. The value stays a single line —
  // Enter is blocked and pasted newlines are collapsed to spaces.
  if (field?.options?.wrap) {
    const { onChange, ...textareaProps } = restProps;
    return (
      <Textarea
        {...textareaProps}
        ref={ref}
        rows={1}
        placeholder={placeholder}
        className={cn(
          "min-h-0 resize-none overflow-hidden text-base",
          field?.readonly && "focus-visible:border-input focus-visible:ring-0",
        )}
        readOnly={field?.readonly}
        onKeyDown={(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => {
          if (/[\r\n]/.test(event.target.value)) {
            event.target.value = event.target.value.replace(/[\r\n]+/g, " ");
          }
          onChange?.(event);
        }}
      />
    );
  }

  return <Input {...restProps} ref={ref} placeholder={placeholder} className={cn("text-base", field?.readonly && "focus-visible:border-input focus-visible:ring-0")} readOnly={field?.readonly} />;
});

EditComponent.displayName = "EditComponent";

export { EditComponent };
