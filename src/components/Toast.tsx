export function Toast({ msg, type }: { msg: string; type: string }) {
  return <div className={`toast show ${type}`}>{msg}</div>
}
