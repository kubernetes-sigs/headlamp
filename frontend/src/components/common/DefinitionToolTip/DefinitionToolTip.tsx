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

import { Icon } from '@iconify/react';
import {
  alpha,
  Box,
  //   Button,
  IconButton,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
// import Fuse from 'fuse.js';
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import getDocDefinitions from '../../../lib/docs';
import { useCluster } from '../../../lib/k8s';
import { getAllDocs } from '../../../redux/docsSlice';
import getAllDocDefinitions, { getContextKeyword } from './Util';

interface DefinitionToolTipProps {
  /**
   * The keyword to look up in the documentation.
   */
  keyword: string;
  /**
   * Whether the keyword is plural (e.g., "Pods" vs "Pod").
   * Defaults to false.
   */
  isPlural?: boolean;
  /**
   * Whether the keyword is a resource (e.g., "Pod", "Node").
   * Defaults to false.
   */
  isResource?: boolean;
}

export function DefinitionToolTip({
  keyword,
  isPlural = false,
  isResource = false,
}: DefinitionToolTipProps) {
  const theme = useTheme();
  const clusterName = useCluster();
  const location = useLocation();

  const [docsData, setDocsData] = useState<any>(null);
  const [contextKeyword, setContextKeyword] = useState<string>('');

  // keep this as it works as the original
  // const keywordDef = docsData?.description;
  const keywordDef = docsData?.description;

  const formattedKeyword = formatKeyword(keyword);

  const allDocs = useSelector((state: any) => state.docs.allDocs);
  const dispatch = useDispatch();

  useEffect(() => {
    if (!allDocs) {
      dispatch(getAllDocs());
    }

    console.log('SLICE DOCS', allDocs);
  }, []);

  // ---------- NOTE TO ME
  // how this works:
  // 1. find a name or label in the details view of a resource and replace the normal name with this component
  // 2. we will either use the actual resource description (e.g., "Pod" or "Node") or the local description that is more accurate to the context of the resource
  // 3. the local description is set in the localResourceDefs state (idk if I want this to be in local storage or not)
  //  note: the localResourceDefs is the entire list of definitions that are used in the frontend
  //        if the keyword is a resource we can just use the immediate description from the docsData via docsData?.description
  //        if the keyword is not a resource, we will use the localResourceDefs but first we must find it in the all list
  // 4. the localKeywordDef state is used to store the current keyword definition

  // ----------

  // remove later
  // pretend we saved this from local storage and get it from there and it works RIGHT NOW IT DOES NOT, WE ARE SETTING IT LATER
  const [localResourceDefs, setLocalResourceDefs] = useState<any>(
    localStorage.getItem('allResourceDefs')
  );

  const [localKeywordDef, setLocalKeywordDef] = useState<any>('');

  // TO DO: I will move this stuff into the settings tab so we can toggle off and on and also set the master defs there
  // for now we pretend that we are doing that in the pods place

  console.log('localResourceDefs', localResourceDefs);

  // ----------

  function formatKeyword(keyword: string) {
    let formattedWord = keyword.replace(/\s+/g, '');

    // If the keyword used in the frontend ends with 's', we remove it for the definition lookup
    // not to be used for keywords that need to end with 's' like 'Ingress'

    if (isPlural) {
      formattedWord = formattedWord.slice(0, -1);
    }

    return formattedWord;
  }

  console.log('keywordDef', keywordDef);
  console.log('clusterName', clusterName);
  console.log('keyword', keyword);
  console.log('formattedKeyword', formattedKeyword);
  console.log('contextKeyword', contextKeyword);

  // TO DO: FOR NODE -- DONE???
  // we need to set this up in a way that we can take a keyword that is a real resource like "Node" or "Pod"
  // and have it search for the real resource name first?

  // may need to have another prop like 'isResource' to choose if we want to use the default resource description
  // or the local description that are more accurate to the context of the resource
  // (for example, service account under "pod" is deprecated, so we should use the real resource description)

  // ----------

  function getDefinitionForKeyword(keyword: string) {
    if (localResourceDefs) {
      const matchinResource = Object.keys(localResourceDefs).find(key => {
        const defKey = key.split('.').pop()?.toLowerCase();
        return defKey === contextKeyword.toLowerCase();
      });

      const resourceDef = matchinResource ? localResourceDefs[matchinResource] : undefined;

      console.log('PRINT RESOURCE DEF', resourceDef);

      // if found, this should be something like "io.k8s.api.apps.v1.Pod"
      // but now we want to get into THAT but .properties which contain .metadata .spec and .status
      if (resourceDef) {
        const metadataProps = resourceDef.properties?.metadata?.properties;
        const specProps = resourceDef.properties?.spec?.properties;
        const statusProps = resourceDef.properties?.status?.properties;

        const metadataPropsKeys = Object.keys(metadataProps || {});
        const specPropsKeys = Object.keys(specProps || {});
        const statusPropsKeys = Object.keys(statusProps || {});

        // set the new localKeywordDef, which is the def found from the localResourceDefs
        // this one is more accurate to the context of the resource and provides better information

        let foundKeyDef;

        const lowerKeyword = keyword.toLowerCase();

        const metadataKey = metadataPropsKeys.find(k => k.toLowerCase() === lowerKeyword);

        if (metadataKey) {
          foundKeyDef = metadataProps[metadataKey];
        } else {
          const specKey = specPropsKeys.find(k => k.toLowerCase() === lowerKeyword);
          if (specKey) {
            foundKeyDef = specProps[specKey];
          } else {
            const statusKey = statusPropsKeys.find(k => k.toLowerCase() === lowerKeyword);
            if (statusKey) {
              foundKeyDef = statusProps[statusKey];
            }
          }
        }

        if (foundKeyDef && foundKeyDef.description) {
          setLocalKeywordDef(foundKeyDef.description);
          console.log('FOUND THE DEF KEY', foundKeyDef);
        }
      }
    }
  }

  useEffect(() => {
    setContextKeyword(getContextKeyword(location.pathname));

    if (clusterName) {
      if (isResource) {
        getDocDefinitions('v1', formattedKeyword).then(data => {
          setDocsData(data);
          setLocalKeywordDef(data?.description || '');
        });
      } else {
        // remove later
        getAllDocDefinitions().then(data => {
          setLocalResourceDefs(data);
          return data;
        });

        getDefinitionForKeyword(formattedKeyword);
      }
    }
  }, [clusterName, localResourceDefs, localKeywordDef]);

  useEffect(() => {
    console.log('docsData', docsData);
  }, [docsData]);

  return (
    <Typography>
      {keyword}
      {/* {!!keywordDef && ( */}
      {!!localKeywordDef && (
        <Tooltip
          title={
            <Box sx={{ maxWidth: 300 }}>
              <Typography variant="body2">{localKeywordDef}</Typography>
            </Box>
          }
        >
          <IconButton size="small" sx={{ color: alpha(theme.palette.text.primary, 0.6) }}>
            <Icon icon="mdi:information-outline" />
          </IconButton>
        </Tooltip>
      )}
    </Typography>
  );
}
