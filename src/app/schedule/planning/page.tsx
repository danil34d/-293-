import { redirect } from 'next/navigation';

export default function PlanningRedirect() {
  redirect('/schedule?tab=planning');
}
