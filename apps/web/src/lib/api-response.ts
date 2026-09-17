/** Nest may send an empty 200 body for a nullable record that does not exist. */
export async function readApiJson<T>(response: Response): Promise<T> {
  const body = await response.text();
  return (body.trim() ? JSON.parse(body) : null) as T;
}
