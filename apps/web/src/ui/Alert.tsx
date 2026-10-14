import type { ReactNode } from 'react';
import { Icon } from './Icon';
import styles from './Alert.module.css';

export interface AlertProps {
  tone?: 'danger' | 'warning';
  children: ReactNode;
  id?: string;
}

/** Message annoncé aux lecteurs d'écran dès son apparition (role="alert"). */
export function Alert({ tone = 'danger', children, id }: AlertProps) {
  return (
    <div id={id} role="alert" className={`${styles.alert} ${styles[tone]}`}>
      <Icon name={tone === 'danger' ? 'alert-circle' : 'warning'} size={22} strokeWidth={2.4} />
      <div className={styles.text}>{children}</div>
    </div>
  );
}
