export default function Header() {
  const today = new Date();

  const formattedDate = today.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">Exercise Snack</p>
        <h1>Today’s movement menu</h1>
      </div>

      <div>
        <p className="eyebrow">Current day</p>
        <h2>{formattedDate}</h2>
      </div>
    </header>
  );
}