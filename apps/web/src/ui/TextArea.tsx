import { useId, type TextareaHTMLAttributes } from 'react';
import styles from './TextField.module.css';

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export function TextArea({ label, id, className, ...rest }: TextAreaProps) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <div className={className}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <div className={`${styles.control} ${styles.multiline}`}>
        <textarea id={inputId} rows={3} className={styles.input} {...rest} />
      </div>
    </div>
  );
}
