// Awards, worded: the story page and the summary panel.
import { h, fmt } from './ui.js';
import { t, tn } from './i18n.js';

const clock = (min) => fmt.time(new Date(2000, 0, 1, Math.floor(min / 60), min % 60));

/** [title, line] for an award, in the current language. */
export function awardCopy(a) {
  switch (a.id) {
    case 'marathon': return [t('The Marathon'), a.title ? t('{h} hours in one sitting: “{title}”.', { h: fmt.hours(a.h), title: a.title }) : t('{h} hours in one sitting.', { h: fmt.hours(a.h) })];
    case 'earlybird': return [t('First One In'), t('A meeting at {time}. Coffee was optional.', { time: clock(a.min) })];
    case 'nightowl': return [t('Last One Out'), t('Still in a meeting at {time}.', { time: clock(a.min) })];
    case 'stamina': return [t('Iron Stamina'), t('{n} meetings back to back, without a breath.', { n: fmt.int(a.n) })];
    case 'wall': return [t('Wall to Wall'), t('{h} hours of meetings on {date}.', { h: fmt.hours(a.h), date: fmt.date(a.date) })];
    case 'sidekick': return [t('Best Supporting Role'), a.name ? t('{name}, {n} times. A double act.', { name: a.name, n: fmt.int(a.n) }) : t('One person, {n} times. A double act.', { n: fmt.int(a.n) })];
    case 'escape': return [t('The Escape Artist'), t('{n} working days in a row without a meeting.', { n: fmt.int(a.n) })];
    case 'friday': return [t('Friday Afternoon Hero'), t('{n} meetings after lunch on a Friday.', { n: fmt.int(a.n) })];
    case 'flyer': return [t('Frequent Flyer'), tn('{n} trip this year.', '{n} trips this year.', a.n)];
    case 'boots': return [t('Boots on the Ground'), t('{n} days on site, face to face.', { n: fmt.int(a.n) })];
    case 'customer': return [t('Customer Champion'), t('{p}% of your meeting time with customers.', { p: fmt.int(a.p) })];
    case 'convener': return [t('The Convener'), t('You sent {n} invitations.', { n: fmt.int(a.n) })];
    case 'yes': return [t('Yes, And'), a.n ? t('Declined only {n} meetings all year.', { n: fmt.int(a.n) }) : t('Didn’t decline a single meeting all year.')];
    case 'maybe': return [t('The Maybe'), t('{n} invitations never answered.', { n: fmt.int(a.n) })];
    case 'timezones': return [t('Time Zone Juggler'), t('{n} meetings before 8 or after 6.', { n: fmt.int(a.n) })];
    case 'regular': return [t('The Regular'), t('{n} workouts in the diary.', { n: fmt.int(a.n) })];
    case 'foodie': return [t('Professional Eater'), t('{n} meals and drinks out.', { n: fmt.int(a.n) })];
    case 'culture': return [t('Culture Vulture'), t('{n} shows, films and gigs.', { n: fmt.int(a.n) })];
    case 'protector': return [t('Weekend Protector'), t('{n} weekends with nothing planned.', { n: fmt.int(a.n) })];
    case 'oracle': return [t('Birthday Oracle'), t('{n} birthdays remembered.', { n: fmt.int(a.n) })];
    case 'always': return [t('Always Something On'), t('{n} days in a row with plans.', { n: fmt.int(a.n) })];
    case 'getaway': return [t('The Great Escape'), t('{n} days away in one go.', { n: fmt.int(a.n) })];
    default: return [a.id, ''];
  }
}

export const hasAwards = (s) => (s.awards || []).length >= 3;

const medal = (a, attrs = {}) => {
  const [title, line] = awardCopy(a);
  return h('li', { class: 'award', ...attrs }, h('span', { class: 'award-medal', 'aria-hidden': 'true' }, a.emoji), h('span', { class: 'award-text' }, h('b', {}, title), h('span', {}, line)));
};

export function awardsSlide(s) {
  const list = s.awards.slice(0, 5);
  return {
    theme: 'c-yellow',
    render: () => h('div', {},
      h('p', { class: 'cap', 'data-reveal': '' }, t('Awards')),
      h('h2', { class: 'line', 'data-reveal': '' }, tn('The year gave you {n} award.', 'The year gave you {n} awards.', list.length)),
      h('ol', { class: 'awards' }, list.map((a, i) => medal(a, { 'data-reveal': '', style: `--k:${i}` })))),
  };
}

export function awardsPanel(s) {
  if (!hasAwards(s)) return null;
  return h('div', { class: 'panel awards-panel', 'data-reveal': '' },
    h('h3', {}, t('Your awards')),
    h('p', { class: 'sub' }, t('What the year gave you, the most unusual first.')),
    h('ol', { class: 'awards awards-light' }, s.awards.map((a) => medal(a))));
}
