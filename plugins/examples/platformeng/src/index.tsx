import { Icon } from '@iconify/react';
import {
  AppLogoProps,
  DetailsViewSectionProps,
  K8s,
  registerAppBarAction,
  registerAppLogo,
  registerDetailsViewSection,
  registerRoute,
  registerRouteFilter,
  registerSidebarEntry,
  registerSidebarEntryFilter,
} from '@kinvolk/headlamp-plugin/lib';
import { SectionBox } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { SvgIcon } from '@mui/material';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import LogoWithTextLight from './icon-large-light.svg';
import LogoLight from './icon-small-light.svg';
import Message from './Message';

const showOnly = true;
if (showOnly) {
  /**
   * A simple logo using two different SVG files.
   * One for the small logo (used in mobile view), and a larger one used in desktop view.
   *
   * The main benefit of a SVG logo is that
   * it's easier to make it look good with light and dark themes.
   */
  function SimpleLogo(props: AppLogoProps) {
    const { logoType, className, sx } = props;

    return (
      <SvgIcon
        className={className}
        component={logoType === 'large' ? LogoWithTextLight : LogoLight}
        viewBox="0 0 auto 32"
        sx={sx}
      />
    );
  }
  registerAppLogo(SimpleLogo);

  /** Add a little notification on the number of pods */
  function PodCounter() {
    const [pods, error] = K8s.ResourceClasses.Pod.useList();
    const msg = pods === null ? 'Loading…' : pods.length.toString();
    return <Message msg={msg} error={error} />;
  }
  registerAppBarAction(PodCounter);

  /* Add a help button linking to some docs */
  registerAppBarAction(function HelpButton() {
    return (
      <IconButton
        title="External Help docs"
        onClick={() => window.open('https://platform-help.example.com')}
        size="large"
      >
        <Icon icon={'mdi:help-circle'} />
      </IconButton>
    );
  });

  // Add a feedback sidebar link, and a page for it too.
  // The sidebar link URL is: /c/mycluster/feedback
  registerSidebarEntry({
    parent: null,
    name: 'feedback',
    label: 'Feedback',
    url: '/feedback',
    icon: 'mdi:comment-quote',
  });

  // This component rendered at URL: /c/mycluster/feedback
  registerRoute({
    path: '/feedback',
    sidebar: 'feedback',
    name: 'feedback',
    exact: true,
    component: () => (
      <SectionBox title="Feedback" textAlign="center" paddingTop={2}>
        <Typography>Embed your feedback forms here</Typography>
      </SectionBox>
    ),
  });

  // We can remove pages and sidebar entries too.
  // Remove "Namespaces" second level sidebar menu item
  registerSidebarEntryFilter(entry => (entry.name === 'namespaces' ? null : entry));
  // Remove "/namespaces" route
  registerRouteFilter(route => (route.path === '/namespaces' ? null : route));

  // We can add custom sections inside a detail view
  registerDetailsViewSection(({ resource }: DetailsViewSectionProps) => {
    if (resource && resource.kind === 'Service') {
      return (
        <SectionBox title="A custom very fine section title">
          The body of our custom Section for {resource.kind}
        </SectionBox>
      );
    }
    return null;
  });
}

if (0) {
}
