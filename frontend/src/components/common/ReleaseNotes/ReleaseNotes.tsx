import React from 'react';
import semver from 'semver';
import ReleaseNotesModal from './ReleaseNotesModal';
import UpdatePopup from './UpdatePopup';

function getAppVersion() {
  return localStorage.getItem('app_version');
}

function setAppVersion(value: string) {
  localStorage.setItem('app_version', value);
}

export default function ReleaseNotes() {
  const { desktopApi } = window;
  const [releaseNotes, setReleaseNotes] = React.useState<string>('');
  const [releaseDownloadURL, setReleaseDownloadURL] = React.useState<string | null>(null);
  const [fetchingRelease, setFetchingRelease] = React.useState<boolean>(false);
  const [releaseFetchFailed, setReleaseFetchFailed] = React.useState<boolean>(false);
  const [skipFetch, setSkipFetch] = React.useState(false);

  // network controller this makes sure if the github request is still lying around we
  // abort it on fetch release skip press button click
  const controller = new AbortController();
  const signal = controller.signal;

  React.useEffect(() => {
    if (desktopApi) {
      desktopApi.receive(
        'appConfig',
        (config: { appVersion: string; checkForUpdates: boolean }) => {
          const { appVersion: currentBuildAppVersion, checkForUpdates = true } = config;
          if (!checkForUpdates) {
            console.debug("Skipping update check because config's checkForUpdates is false");
            return;
          }

          /**
           * Fetches latest github release and sets the releaseNotes plus releaseDownloadURL.
           *
           * Also sets the following state whilst running:
           * - fetchingRelease
           * - releaseFetchFailed
           * - skipFetch
           */
          async function fetchRelease() {
            // attach a timeout which checks after 5 seconds of fetching release
            // if the release request was not successful
            const timeoutID = setTimeout(() => {
              setFetchingRelease(true);
            }, 5000);

            const githubReleaseURL = `https://api.github.com/repos/kinvolk/headlamp/releases`;

            try {
              // get all the releases -> default decreasing order of releases
              const response = await fetch(githubReleaseURL, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                },
                signal,
              });

              if (!response.ok) {
                throw new Error('Network response was not ok');
              }

              type GithubRelease = {
                name: string;
                html_url: string;
                body: string;
              };

              const releases: GithubRelease[] = await response.json();

              // Get the latest release that is not headlamp-plugin or headlamp-helm.
              const latestRelease = releases.find(
                release => !release.name?.startsWith('headlamp-')
              );

              if (
                latestRelease &&
                semver.gt(latestRelease.name, currentBuildAppVersion) &&
                !import.meta.env.FLATPAK_ID
              ) {
                setReleaseDownloadURL(latestRelease.html_url);
              }

              // check if there is already a version in store, if it exists don't store the current version
              // this check will help us later in determining whether we are on the latest release or not.
              const storedAppVersion = getAppVersion();
              let releaseNotes = '';

              if (storedAppVersion && semver.lt(storedAppVersion, currentBuildAppVersion)) {
                // get the release notes for the version with which the app was built
                const tagReleaseURL = `https://api.github.com/repos/kinvolk/headlamp/releases/tags/v${currentBuildAppVersion}`;

                try {
                  const tagResponse = await fetch(tagReleaseURL, {
                    method: 'GET',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    signal,
                  });

                  if (!tagResponse.ok) {
                    throw new Error('Network response was not ok');
                  }

                  const tagData = await tagResponse.json();
                  const [notes] = tagData.body.split('<!-- end-release-notes -->');
                  if (notes) {
                    releaseNotes = notes;
                  }
                } catch (err) {
                  setReleaseFetchFailed(true);
                  console.error(
                    `Error getting release notes for version ${currentBuildAppVersion}:`,
                    err
                  );
                }
              }

              // If all of the above was done before we need to warn the user, we don't need to warn them.
              clearTimeout(timeoutID);
              setFetchingRelease(false);

              // set the store version to the current so that we don't show release notes on
              // every start of the app
              setAppVersion(currentBuildAppVersion);

              // Calling this after setting the version above, so the release notes have the right version
              // set when they show it.
              if (releaseNotes) {
                setReleaseNotes(releaseNotes);
              }
            } catch (error) {
              setReleaseFetchFailed(true);
              console.error('Failed to fetch release:', error);
              clearTimeout(timeoutID);
              setFetchingRelease(false);
            }
          }

          const isUpdateCheckingDisabled = JSON.parse(
            localStorage.getItem('disable_update_check') || 'false'
          );
          if (!isUpdateCheckingDisabled && !fetchingRelease && !skipFetch) {
            fetchRelease();
          }
        }
      );
    }
  }, [fetchingRelease, skipFetch]);

  React.useEffect(() => {
    desktopApi?.send('appConfig');
  }, []);

  return (
    <>
      {
        <UpdatePopup
          releaseDownloadURL={releaseDownloadURL || ''}
          fetchingRelease={fetchingRelease}
          releaseFetchFailed={releaseFetchFailed}
          skipUpdateHandler={() => {
            // abort the github release fetch
            controller.abort();
            setSkipFetch(false);
            setFetchingRelease(false);
          }}
        />
      }
      {releaseNotes && (
        <ReleaseNotesModal releaseNotes={releaseNotes} appVersion={getAppVersion()} />
      )}
    </>
  );
}
