/*
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Box from '@mui/material/Box';
import MuiLink from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import Ingress, { IngressBackend, IngressRule } from '../../lib/k8s/ingress';
import { useSettings } from '../App/Settings/hook';
import LabelListItem from '../common/LabelListItem';
import Link from '../common/Link';
import { DetailsGrid } from '../common/Resource';
import { SectionBox } from '../common/SectionBox';
import SimpleTable from '../common/SimpleTable';

/**
 * Is https used in the ingress item
 */
function isHttpsUsed(item: Ingress, url: String) {
  const hostList = item.jsonData.spec?.tls?.map(({ ...hosts }) => `${hosts.hosts}`) ?? [];
  const isHttps = hostList.includes(`${url}`);

  return isHttps;
}

export interface LinkStringFormatProps {
  url: string;
  item: Ingress;
  urlPath?: string;
}

/**
 * Format the url to be used in the Link component
 */
export function LinkStringFormat({ url, item, urlPath }: LinkStringFormatProps) {
  let urlProtocol;
  let formatURL;

  /**
   * Renders the "host" field as we intentionally do not supply a path.
   * If the url is set to * or undefined/empty, and the optional path is not used, print url
   */
  if ((url === '*' || !url) && !urlPath) {
    return <Typography>{url || ''}</Typography>;
  }

  /**
   * Renders the "path" field as we intentionally supply both a path and url.
   */
  if ((url === '*' || !url) && urlPath) {
    return <Typography>{urlPath}</Typography>;
  } else {
    /*
     * If the ingress does not use tls, then the url should be http
     */
    if (!item.jsonData.spec?.tls) {
      urlProtocol = 'http://';
    } else {
      /*
       * If the url is in the tls array, then the url should be https
       */
      isHttpsUsed(item, url) ? (urlProtocol = 'https://') : (urlProtocol = 'http://');
    }

    /*
     * Since we cannot access the prefix from the ingress object, we have to access it from the rules array
     */
    const rules: any[] | undefined = item.spec.rules;
    let currentPathType;
    if (rules) {
      for (let i = 0; i < rules.length; i++) {
        for (let j = 0; j < rules[i].http.paths.length; j++) {
          if (rules[i].http.paths[j].path === urlPath) {
            currentPathType = rules[i].http.paths[j].pathType;
          }
        }
      }
    }

    function isValidURL(url: string): boolean {
      try {
        new URL(url);
      } catch (e) {
        return false;
      }
      return true;
    }

    /**
     * Adding the protocol to the url string is required for the URL constructor to work because data.host is only the host name
     */
    if (!isValidURL(urlProtocol + url)) {
      console.debug(`Ingress' host ${url} is not a valid URL; displaying it without a link.`);
      return <Typography>{url}</Typography>;
    }

    formatURL = new URL(urlProtocol + url);

    if (formatURL && urlPath) {
      return (
        <Box style={{ display: 'flex', marginBottom: '5px' }}>
          <MuiLink
            href={`${formatURL.protocol}//${formatURL.hostname}${urlPath}`}
            style={{ marginRight: '5px' }}
          >
            {urlPath}
          </MuiLink>
          {`(${currentPathType})`}
        </Box>
      );
    }

    return <MuiLink href={formatURL.toString()}>{`${formatURL.toString()}`}</MuiLink>;
  }
}

export interface BackendFormatProps {
  backend: IngressBackend[];
}

/**
 * Used to format the backend to be used in the backends field
 */

export function BackendFormat({ backend }: BackendFormatProps) {
  const backendList: string[] = [];
  for (const backendItem of backend) {
    let currentBackend: string = '';

    if (!!backendItem.resource) {
      currentBackend = backendItem.resource.kind + ':' + backendItem.resource.name;
    }
    if (!!backendItem.service) {
      currentBackend =
        backendItem.service.name +
        ':' +
        (backendItem.service.port.number ?? backendItem.service.port.name ?? '').toString();
    }

    backendList.push(currentBackend);
  }

  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        flexWrap: 'nowrap',
        marginBottom: '5px',
      }}
    >
      {backendList.map(backendItem => (
        <Typography key={backendItem}>{backendItem}</Typography>
      ))}
    </Box>
  );
}

export default function IngressDetails(props: {
  name?: string;
  namespace?: string;
  cluster?: string;
}) {
  const params = useParams<{ namespace: string; name: string }>();
  const { name = params.name, namespace = params.namespace, cluster } = props;
  const { t } = useTranslation(['glossary', 'translation']);
  const storeRowsPerPageOptions = useSettings('tableRowsPerPageOptions');

  function getPorts(item: Ingress) {
    const ports: string[] = [];
    item.getRules().forEach(rule => {
      rule.http?.paths.forEach(path => {
        if (!!path.backend.service) {
          const portNumber =
            path.backend.service.port.number ?? path.backend.service.port.name ?? '';
          ports.push(portNumber.toString());
        } else if (!!path.backend.resource) {
          ports.push(path.backend.resource.kind + ':' + path.backend.resource.name);
        }
      });
    });

    if (!!item.spec?.tls) {
      ports.push('443');
    }

    return ports.sort((a, b) => a.localeCompare(b));
  }

  function getDefaultBackend(item: Ingress) {
    const { service, resource } = item.spec?.defaultBackend || {};
    return (
      (service && service.name + ':' + (service.port.number ?? service.port.name ?? '-')) ||
      (resource && resource.kind + '/' + resource.name) ||
      '-'
    );
  }

  return (
    <DetailsGrid
      resourceType={Ingress}
      name={name}
      namespace={namespace}
      cluster={cluster}
      withEvents
      extraInfo={ingress =>
        ingress && [
          {
            name: t('Default Backend'),
            value: getDefaultBackend(ingress),
          },
          {
            name: t('Ports'),
            value: getPorts(ingress).join(', '),
          },
          {
            name: 'TLS',
            value: (
              <LabelListItem
                labels={ingress.spec?.tls?.map(
                  (tls: { hosts: string[]; secretName: string }) =>
                    `${tls.secretName} 🞂 ${tls.hosts.join(', ')}`
                )}
              />
            ),
          },
          {
            name: t('Class Name'),
            value: ingress.spec?.ingressClassName ? (
              <Link
                routeName="ingressclass"
                params={{ name: ingress.spec?.ingressClassName }}
                activeCluster={ingress.cluster}
              >
                {ingress.spec?.ingressClassName}
              </Link>
            ) : null,
          },
        ]
      }
      extraSections={item => [
        {
          id: 'headlamp.ingress-rules',
          section: item && (
            <SectionBox title={t('Rules')}>
              <SimpleTable
                rowsPerPage={storeRowsPerPageOptions}
                emptyMessage={t('translation|No rules data to be shown.')}
                columns={[
                  {
                    label: t('translation|Host'),
                    getter: (data: IngressRule) => (
                      <LinkStringFormat url={data.host || '*'} item={item} />
                    ),
                  },
                  {
                    label: t('translation|Path'),
                    getter: (data: IngressRule) =>
                      data.http?.paths.map(({ path }) => (
                        <LinkStringFormat
                          key={path}
                          url={data.host || '*'}
                          item={item}
                          urlPath={path}
                        />
                      )),
                  },
                  {
                    label: t('Backends'),
                    getter: (data: IngressRule) => (
                      <BackendFormat
                        backend={data.http?.paths.map(({ backend }) => backend) ?? []}
                      />
                    ),
                  },
                ]}
                data={item?.getRules() || []}
                reflectInURL="rules"
              />
            </SectionBox>
          ),
        },
      ]}
    />
  );
}
