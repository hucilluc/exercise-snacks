export default function Header() {
  const today = new Date();

  const formattedDate = today.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="app-header compact-header">
      <div>
        <p className="eyebrow">Body Bright</p>
        <h1>Exercise snacks</h1>
      </div>

      <div className="current-date-block">
        <p className="eyebrow">Today</p>
        <h2>{formattedDate}</h2>
      </div>
    </header>
  );
}