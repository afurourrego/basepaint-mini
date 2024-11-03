export default function Button({
  onClick,
  children,
}: {
  onClick: () => void;
  children: string;
}) {
  return (
    <button className="big" onClick={onClick}>
      {children}
    </button>
  );
}
