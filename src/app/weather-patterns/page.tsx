import { redirect } from 'next/navigation';

export default function WeatherPatternsRedirect() {
  redirect('/schedule?tab=weather');
}
