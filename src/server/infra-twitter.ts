import { OAuth } from "oauth"
import * as request from "request-promise-native"
import { TwitterAuth, TwitterConfig } from "../types"
import { partial } from "../utils"

const USER_AGENT = "solotter-web"
const REST_API_BASE = "https://api.twitter.com/1.1"
const REST_API_AUTH = "https://twitter.com/oauth/authenticate"

export interface OAuthCallbackQuery {
  oauth_token: string
  oauth_verifier: string
}

interface TwitterRestAuth {
  oauth: {
    consumer_key: string,
    consumer_secret: string,
    token: string,
    token_secret: string,
  }
}

type TwitterRestGetRequest =
  | {
    pathname: "/statuses/show",
    qs: {
      id: string,
    },
  }

type TwitterRestPostRequest =
  | {
    pathname: "/statuses/update",
    body: {
      status: string,
      in_reply_to_status_id?: string,
      trim_user: true,
    },
  }

const headers = {
  Accept: "*/*",
  Connection: "close",
  "User-Agent": USER_AGENT,
}

interface OAuthCallbackParams {
  oauth_token: string
  oauth_verifier: string
}

export interface OAuthService {
  oauthRequest(authId: string): Promise<{ redirect: string }>
  oauthCallback(params: OAuthCallbackParams): Promise<void>
  oauthEnd(authId: string): TwitterAuth | undefined
}

export const oauthServiceWith =
  (twitterConfig: TwitterConfig): OAuthService => {
    const { adminAuth } = twitterConfig
    const tokenSecrets = new Map<string, { authId: string; token_secret: string }>()
    const auths = new Map<string, TwitterAuth>()

    const oauthClient =
      new OAuth(
        "https://twitter.com/oauth/request_token",
        "https://twitter.com/oauth/access_token",
        twitterConfig.adminAuth.consumer_key,
        twitterConfig.adminAuth.consumer_secret,
        "1.0",
        twitterConfig.callbackURI,
        "HMAC-SHA1",
      )
    return {
      /** Called after the user requested to be authenticated. */
      oauthRequest: (authId: string) =>
        new Promise<{ redirect: string }>((resolve, reject) => {
          oauthClient.getOAuthRequestToken((err, token, token_secret) => {
            if (err) {
              return reject(err)
            }

            const redirectURI = `${REST_API_AUTH}?oauth_token=${token}`

            // Save secret data internally.
            tokenSecrets.set(token, { authId, token_secret })

            resolve({ redirect: redirectURI })
          })
        }),
      /** Called after the twitter redirected to the callback api. */
      oauthCallback: (params: OAuthCallbackParams) =>
        new Promise((resolve, reject) => {
          const { oauth_token: token, oauth_verifier: verifier } = params

          const secret = tokenSecrets.get(token)
          if (!secret) {
            return reject("Invalid auth flow.")
          }
          tokenSecrets.delete(token)
          const { authId, token_secret } = secret

          oauthClient.getOAuthAccessToken(token, token_secret, verifier, (err, token, token_secret) => {
            if (err) {
              return reject(err)
            }

            const userAuth = { ...adminAuth, token, token_secret }
            auths.set(authId, userAuth)
            resolve()
          })
        }),
      oauthEnd: (authId: string) => {
        if (!auths.get(authId)) {
          return undefined
        }
        const userAuth = auths.get(authId)
        auths.delete(authId)
        return userAuth
      },
    }
  }

export const oauthServiceStub = (): OAuthService => {
  let requests = new Map<string, string>()
  let auths = new Map<string, TwitterAuth>()
  return {
    async oauthRequest(authId: string) {
      requests.set("my_token", authId)
      return { redirect: "/api/twitter-auth-callback?oauth_token=my_token" }
    },
    async oauthCallback(params: OAuthCallbackParams) {
      auths.set(requests.get(params.oauth_token)!, {} as TwitterAuth)
    },
    oauthEnd(authId: string) {
      return auths.get(authId)!
    },
  }
}

export const apiGet = async (req: TwitterRestGetRequest & TwitterRestAuth) => {
  const { pathname, oauth, qs } = req

  const url = `${REST_API_BASE}${pathname}.json`

  return await request.get(url, {
    oauth,
    qs,
    headers,
    json: true,
  })
}

export const apiPost = async (req: TwitterRestPostRequest & TwitterRestAuth) => {
  const { pathname, oauth, body } = req

  const url = `${REST_API_BASE}${pathname}.json`

  return await request.get(url, {
    oauth,
    body,
    headers,
    json: true,
  })
}
