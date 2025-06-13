import { Icon } from '@iconify/react';
import { useCluster } from '@kinvolk/headlamp-plugin/lib/K8s';
// import { DocsViewer } from '@kinvolk/headlamp-plugin/lib/components/common/index';
import { Box, Button, Card, CardActions, CardContent, IconButton, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { TreeView } from '@mui/x-tree-view/TreeView';
import Fuse from 'fuse.js';
import React, { useEffect, useState } from 'react';
import { getDocs } from './Util';

interface LumosDocsViewerProps {
  keyword: string;
}

export function LumosDocsViewer({ keyword }: LumosDocsViewerProps) {
  const [searchResult, setSearchResult] = useState<any>([]);
  const [chosenResource, setChosenResource] = useState<any>(null);
  const [docsData, setDocsData] = useState<any>(null);

  const theme = useTheme();

  const clusterName = useCluster();

  useEffect(() => {
    getDocs(clusterName).then(data => {
      setDocsData(data);
    });
  }, [clusterName]);

  useEffect(() => {
    if (keyword) {
      handleSearch();
    }
  }, [keyword, docsData]);

  async function handleSearch() {
    // Transform `data.definitions` into an array of objects
    const definitionsArray = Object.entries(docsData.definitions || {}).map(([key, value]) => {
      const kindName = key.split('.').pop(); // Get the last part of the key

      return {
        kind: kindName, // The original key name
        value, // The corresponding object
      };
    });

    // Set up Fuse.js to search the `key` property
    const fuse = new Fuse(definitionsArray, {
      keys: ['kind'], // Search in the `key` property
      threshold: 0.4, // Adjust threshold for fuzzy matching
      includeScore: true, // Include score in results
      minMatchCharLength: 2, // Minimum length of characters to match
      shouldSort: true, // Sort results by score
    });

    // Perform the search
    const results = fuse.search(keyword, { limit: 10 });

    setSearchResult(results);
  }

  // This function is used to take the link from the description and make it clickable
  function formatDescriptionLinks(description: string) {
    // if the text inlcudes 'https://', then we will make it a link
    if (description.includes('https://')) {
      const url = description.split('https://')[1].split(' ')[0];
      const link = `https://${url}`;
      return (
        <Typography color="textSecondary">
          {description.split('https://')[0]}
          <a href={link} target="_blank" rel="noopener noreferrer">
            {link}
          </a>
        </Typography>
      );
    } else {
      return <Typography color="textSecondary">{description}</Typography>;
    }
  }

  function makeItems(name: string, value: any, key: string) {
    return (
      <TreeItem
        key={key}
        nodeId={`${key}`}
        label={
          <div>
            <Typography display="inline">{name}</Typography>&nbsp;
            <Typography display="inline" color="textSecondary" variant="caption">
              ({value.type})
            </Typography>
          </div>
        }
      >
        <Typography color="textSecondary">{formatDescriptionLinks(value.description)}</Typography>
        {Object.entries(value.properties || {}).map(([name, value], i) =>
          makeItems(name, value, `${key}_${i}`)
        )}
      </TreeItem>
    );
  }

  function RenderDocsTree() {
    function tabBack() {
      setChosenResource(null);
    }

    if (searchResult) {
      return (
        <Box
          sx={{
            marginTop: '0.5rem',
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '90%',
            padding: '0.5rem',
            overflowY: 'auto',
            paddingBottom: '2rem',
          }}
        >
          <Box
            sx={{
              marginBottom: '0.5rem',
              width: 'auto',
            }}
          >
            <IconButton
              onClick={tabBack}
              size="small"
              sx={{
                color: 'white',
                background: theme.palette.mode === 'dark' ? '#2a89d1' : '#1976d2',
                borderRadius: '10%',
                '&:hover': {
                  background: '#3a5ca1',
                },
              }}
            >
              <Icon icon="mdi:arrow-left" />
              <Typography>Back</Typography>
            </IconButton>
          </Box>
          <Card
            sx={{
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              height: '90%',
              maxHeight: '90%',
              padding: '0.5rem',
              overflowY: 'auto',
              flexGrow: 1,
              marginBottom: '2rem',
            }}
          >
            <CardContent
              sx={{
                display: 'flex',
                flexDirection: 'column',
                flexGrow: 1,
                overflowY: 'auto',
                padding: '0.5rem',
                msOverflowStyle: 'none',
                scrollbarWidth: 'none',
                '&::-webkit-scrollbar': {
                  display: 'none',
                },
                paddingBottom: '2rem',
              }}
            >
              <Box
                sx={{
                  marginBottom: '0.5rem',
                }}
              >
                <Typography variant="h5" component="div">
                  {chosenResource.kind}
                </Typography>
              </Box>
              <Box
                sx={{
                  marginBottom: '0.5rem',
                }}
              >
                <Typography>{chosenResource.value.description}</Typography>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  flexGrow: 1,
                  overflowY: 'auto',
                  padding: '0.5rem',
                  msOverflowStyle: 'none',
                  scrollbarWidth: 'none',
                  '&::-webkit-scrollbar': {
                    display: 'none',
                  },
                  paddingBottom: '2rem',
                }}
              >
                <TreeView
                  sx={{
                    flexGrow: 1,
                    maxWidth: '100%',
                    paddingBottom: '2rem',
                  }}
                  defaultCollapseIcon={<Icon icon="mdi:chevron-down" />}
                  defaultExpandIcon={<Icon icon="mdi:chevron-right" />}
                >
                  {Object.entries(chosenResource.value.properties || {}).map(([name, value], i) =>
                    makeItems(name, value, i.toString())
                  )}
                </TreeView>
              </Box>
            </CardContent>
          </Card>
        </Box>
      );
    } else {
      return <Typography>NO DATA</Typography>;
    }
  }

  // Search results
  function RenderSearchResults({ searchData }: { searchData: any }) {
    function MakeSearchCard(name: string, value: any) {
      function handleChosenResource() {
        const searchDataArray = Array.isArray(searchData) ? searchData : Object.values(searchData);

        searchDataArray.forEach((key: any) => {
          const searchItem = key.item;
          if (searchItem.kind === name && searchItem.value === value) {
            setChosenResource(searchItem);
          }
        });
      }

      return (
        <Box
          sx={{
            flexGrow: 1,
          }}
        >
          <Card
            sx={{
              margin: '0.5rem',
            }}
          >
            <CardContent>
              <Typography variant="h5" component="div">
                {name}
              </Typography>
              <Typography variant="body2">{value.description}</Typography>
            </CardContent>
            <CardActions>
              <Button
                size="small"
                onClick={handleChosenResource}
                sx={{
                  textDecoration: 'underline',
                }}
              >
                <Typography
                  sx={{
                    color: theme.palette.text.primary,
                    textDecoration: 'underline',
                  }}
                >
                  Learn More
                </Typography>
              </Button>
            </CardActions>
          </Card>
        </Box>
      );
    }

    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '90%',
          padding: '0.5rem',
          overflow: 'hidden',
        }}
      >
        <Typography variant="h6">
          Search results for: {keyword}
          <Typography></Typography>
        </Typography>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            overflowY: 'auto',
            padding: '0.5rem',
            msOverflowStyle: 'none',
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': {
              display: 'none',
            },
            paddingBottom: '2rem',
          }}
        >
          {searchResult.map((item: any) => {
            const { item: searchItem } = item;
            return MakeSearchCard(searchItem.kind, searchItem.value);
          })}
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        marginTop: '0.5rem',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        oveflowY: 'auto',
        overflowX: 'hidden',
        height: '100%',
        padding: '0.5rem',
      }}
    >
      {searchResult && !chosenResource && <RenderSearchResults searchData={searchResult} />}

      {chosenResource && <RenderDocsTree />}
    </Box>
  );
}
