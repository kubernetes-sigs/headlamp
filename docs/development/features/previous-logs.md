# Previous Logs Feature

## Overview

The Previous Logs feature allows users to view logs from previous container instances when containers have crashed or restarted. This is equivalent to the `kubectl logs <pod-name> --previous` command and is essential for debugging container failures.

## Feature Implementation

### User Interface

#### Pod List View
- **Logs Button**: Available for all pods with log access permissions
- **Previous Logs Button**: Only visible for pods with containers that have `restartCount > 0`
- **Crashed Container Indicator**: Special styling and icon for crashed containers

#### Pod Details View
- **Enhanced Previous Logs Toggle**: 
  - Disabled for containers without restarts
  - Warning styling for restarted containers
  - Error styling for crashed containers
  - Visual indicators (icons) when viewing previous logs

#### Workload Resources (Deployments, ReplicaSets, DaemonSets)
- **Enhanced Previous Logs Toggle**: Similar to Pod Details but works across multiple pods
- **Crash Detection**: Automatically detects crashed containers across all pods

### Technical Implementation

#### API Integration
The feature uses the Kubernetes API endpoint:
```
GET /api/v1/namespaces/{namespace}/pods/{pod}/log?previous=true
```

#### Container State Detection
The system detects container states:
- **Normal**: `restartCount = 0`
- **Restarted**: `restartCount > 0`
- **Crashed**: 
  - `state.waiting.reason = "CrashLoopBackOff"`
  - `state.terminated.reason = "Error"`
  - `lastState.terminated.reason = "Error"`

#### Components

##### PodLogViewer
- **Props**: 
  - `showPreviousDefault?: boolean` - Start with previous logs enabled
- **Features**:
  - Container selection dropdown
  - Enhanced previous logs toggle with crash detection
  - Visual indicators for crashed containers
  - Improved error handling

##### PodLogsButton (Pod List)
- **Features**:
  - Standard logs button for all pods
  - Additional "Previous Logs" button for restarted containers
  - Crash indicators and special styling
  - Direct access to previous logs

##### LogsButton (Workload Resources)
- **Features**:
  - Enhanced previous logs toggle
  - Multi-pod crash detection
  - Restart count display
  - Improved tooltips and error messages

### User Experience

#### For Normal Containers
- Previous logs option is disabled
- Clear tooltip explaining why it's unavailable
- Standard logs functionality

#### For Restarted Containers
- Previous logs toggle is enabled
- Warning styling to indicate previous logs viewing
- Restart count information in tooltips

#### For Crashed Containers
- Previous logs toggle is prominently displayed
- Error styling (red) to indicate critical state
- Special "Previous Logs (Crashed)" label
- Alert icons and crash indicators
- Helpful tooltips encouraging debugging

## Usage Examples

### Debugging a Crashed Pod

1. **From Pod List**:
   - Navigate to Workloads → Pods
   - Find the crashed pod (indicated by error status)
   - Click the "Previous Logs (Crashed)" button (red icon)
   - Log viewer opens with previous logs enabled

2. **From Pod Details**:
   - Navigate to the crashed pod's details page
   - Click "Show Logs" button
   - Toggle "Previous Logs (Crashed)" switch
   - View logs from the crashed container instance

3. **From Workload Resources**:
   - Navigate to Deployments/ReplicaSets/DaemonSets
   - Click "Show Logs" for a workload with crashed pods
   - Select the crashed pod and container
   - Enable "Previous Logs (Crashed)" toggle

### Comparing Current and Previous Logs

1. Open logs for a restarted container
2. View current logs first
3. Toggle "Previous Logs" to see what happened before restart
4. Toggle back to current logs to see recovery

## Accessibility

- **ARIA Labels**: All buttons have descriptive ARIA labels
- **Keyboard Navigation**: Full keyboard support for all controls
- **Screen Reader Support**: Proper labeling and state announcements
- **Color Contrast**: High contrast colors for error and warning states
- **Tooltips**: Comprehensive tooltips for all interactive elements

## Testing

### Unit Tests
- `PodLogViewer.test.tsx`: Tests for the enhanced log viewer
- `PodLogsButton.test.tsx`: Tests for the pod list logs buttons
- Coverage for all container states and user interactions

### Storybook Stories
- `PodLogViewer.stories.tsx`: Visual documentation and testing
- Stories for normal, restarted, and crashed containers
- Interactive examples for all use cases

### Manual Testing Scenarios
1. **Normal Pod**: Verify previous logs is disabled
2. **Restarted Pod**: Verify previous logs works with warning styling
3. **Crashed Pod**: Verify crash indicators and error styling
4. **Multi-container Pod**: Verify per-container state detection
5. **Workload Logs**: Verify multi-pod previous logs functionality

## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Performance Considerations

- Previous logs are only fetched when explicitly requested
- No impact on normal log viewing performance
- Efficient container state detection
- Minimal additional API calls

## Future Enhancements

- **Auto-enable Previous Logs**: Automatically enable for crashed containers
- **Log Comparison View**: Side-by-side current vs previous logs
- **Crash Analytics**: Aggregate crash information across workloads
- **Export Previous Logs**: Download previous logs for offline analysis

## Related Issues

- Fixes #3225: View crashed Pod logs (previous logs)
- Implements kubectl --previous equivalent functionality
- Addresses user feedback from Kubernetes Dashboard migration
