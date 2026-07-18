import { TINKR_API_URL } from "@/lib/api";
import { ReviewClient } from "@/components/ReviewClient";

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let revision = null;
  let error = "";
  try {
    const response = await fetch(`${TINKR_API_URL}/api/review/${token}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) error = data.error || "Unavailable";
    else revision = data.revision;
  } catch {
    error = "Could not load review.";
  }

  if (error) return (
    <main style={{ padding: 32, maxWidth: 720, margin: "0 auto" }}>
      <h1>Review unavailable</h1>
      <p style={{ color: "#9d9da7" }}>{error}</p>
    </main>
  );

  return <ReviewClient revision={revision} token={token} />;
}
