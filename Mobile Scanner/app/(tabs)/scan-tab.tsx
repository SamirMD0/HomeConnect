import { Redirect } from 'expo-router';

/** Placeholder route for the centre Scan tab button, which opens /scan itself. */
export default function ScanTab() {
  return <Redirect href="/scan" />;
}
