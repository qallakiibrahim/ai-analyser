export function GET(): Response {
  const randNorm = () => {
    const u1 = Math.max(Math.random(), 1e-10);
    const u2 = Math.random();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  };
  const feedRate = Number(Math.max(0.13, Math.min(0.27, 0.2 + randNorm() * 0.028)).toFixed(4));
  const spindleRpm = Number((2500 + randNorm() * 95).toFixed(1));
  const coolantTemp = Number((22.0 + randNorm() * 0.9).toFixed(2));
  const diameter = Number(
    (10.0 + (coolantTemp - 21.8) * 0.115 + (feedRate - 0.2) * 2.1 + randNorm() * 0.12).toFixed(4)
  );
  const roughness = Number(
    Math.max(0.65, 1.55 + (feedRate - 0.2) * 5.2 + (coolantTemp - 21.8) * 0.04 + randNorm() * 0.1).toFixed(3)
  );

  return Response.json({
    timestamp: new Date().toISOString(),
    values: {
      "Diameter (mm)": diameter,
      "Ytfinhet Ra (µm)": roughness,
      "Kylvätsketemp (°C)": coolantTemp,
      "Matning (mm/varv)": feedRate,
      "Spindelvarvtal (RPM)": spindleRpm,
    },
  });
}
