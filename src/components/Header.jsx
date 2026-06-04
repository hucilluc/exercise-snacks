const guidanceText = "Small enough to start.";

export default function Header() {
  const today = new Date();

  const formattedDate = today.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="app-header mobile-v2-header">
      <p className="app-kicker">Body Bright</p>
      <p className="header-date">{formattedDate}</p>
      <p className="guidance-line">{guidanceText}</p>
    </header>
  );
}