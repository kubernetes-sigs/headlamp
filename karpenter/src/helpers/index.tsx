import { Link } from '@kinvolk/headlamp-plugin/lib/components/common';

export function NameLink(resourceClass: any) {
  const apiVersion = new String(resourceClass.apiVersion);
  const slashIndex = apiVersion.lastIndexOf('/');
  const groupName = slashIndex > 0 ? apiVersion.substring(0, slashIndex) : apiVersion;

  return {
    header: 'Name',
    accessorKey: 'metadata.name',
    Cell: ({ row }: { row: { original: any } }) => {
      const nodeClass = row.original;

      return (
        <Link
          routeName={groupName.substring(0, groupName.indexOf('.'))}
          params={{
            name: nodeClass.jsonData.metadata.name,
            namespace: nodeClass.jsonData.metadata.namespace || 'default',
          }}
        >
          {nodeClass.jsonData.metadata.name}
        </Link>
      );
    },
  };
}
