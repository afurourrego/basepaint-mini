export default function Button({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className="big" onClick={onClick}>
      {children}
    </button>
  );
}
