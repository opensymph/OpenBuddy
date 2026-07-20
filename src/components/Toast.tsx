/** 底部居中的轻量提示。显隐与自动消失由父组件(setTimeout)控制。 */
export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="toast" role="status">{message}</div>;
}
