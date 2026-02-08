# auth

## Index

### Functions

| Function | Description |
| ------ | ------ |
| [deleteTokens](functions/deleteTokens.md) | Deletes all stored authentication tokens |
| [getToken](functions/getToken.md) | Retrieves the authentication token for a given cluster. If a custom getToken method is defined in the Redux store, it will be used. Otherwise, the token is retrieved from local storage. |
| [getUserInfo](functions/getUserInfo.md) | Retrieves the user information encoded in the authentication token for a given cluster. |
| [hasToken](functions/hasToken.md) | Checks whether an authentication token exists for the given cluster. |
| [logout](functions/logout.md) | Logs out the user by clearing the authentication token for the specified cluster. |
| [setToken](functions/setToken.md) | Sets or updates the token for a given cluster using cookie-based storage. The token is stored securely in an HttpOnly cookie on the backend. |
