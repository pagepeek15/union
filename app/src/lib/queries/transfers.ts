import request from "graphql-request"
import { URLS } from "$lib/constants"
import {
  transfersLatestQuery,
  transfersTimestampQuery,
  transfersIncompleteQuery
  // transfersByAddressesLatestQuery,
  // transfersByAddressesTimestampQuery
} from "$lib/graphql/queries/transfers.ts"
import { transferListDataFragment } from "$lib/graphql/fragments/transfers"
import { raise } from "$lib/utilities/index.ts"

import { readFragment, type FragmentOf } from "gql.tada"
import { createQuery, keepPreviousData } from "@tanstack/svelte-query"
import { derived, type Readable } from "svelte/store"

const transferTransform = (tx: FragmentOf<typeof transferListDataFragment>) => {
  const transfer = readFragment(transferListDataFragment, tx)
  // const lastForward = transfer.forwards?.at(-1)
  // const receiver = lastForward?.receiver ?? transfer.receiver
  // const destinationChainId = lastForward?.destination_chain_id ?? transfer.destination_chain_id
  return {
    source: {
      hash: transfer.packet_send_transaction_hash || "unknown",
      chainId: transfer.source_chain_id ?? raise("source_chain_id is null"),
      address: transfer.sender_normalized || "unknown"
    },
    destination: {
      hash: transfer.packet_recv_transaction_hash || "unknown",
      chainId: transfer.destination_chain_id ?? raise("destination_chain_id is null"),
      address: transfer.receiver_normalized || "unknown"
    },
    baseToken: transfer.base_token,
    baseAmount: transfer.base_amount,
    timestamp: `${transfer.packet_send_timestamp}`,
    hash: `${transfer.packet_send_transaction_hash}`,
    token: {
      base: {
        token: transfer.base_token,
        amount: transfer.base_amount,
        chainId: transfer.source_chain_id
      },
      quote: {
        token: transfer.quote_token,
        amount: transfer.quote_amount,
        chainId: transfer.destination_chain_id
      }
    }
  }
}

type TransfersReturnType = Promise<Array<ReturnType<typeof transferTransform>>>

export async function transfersLatest({
  limit = 12
}: { limit?: number } = {}): TransfersReturnType {
  const { data } = await request(URLS().GRAPHQL, transfersLatestQuery, {
    limit
  })
  return data.map(transferTransform)
}

export async function transfersIncomplete(): TransfersReturnType {
  const { data } = await request(URLS().GRAPHQL, transfersIncompleteQuery, {})
  return data.map(transferTransform)
}

export async function transfersTimestamp({
  limit,
  timestamp
}: {
  limit: number
  timestamp: string
}): TransfersReturnType {
  const { older, newer } = await request(URLS().GRAPHQL, transfersTimestampQuery, {
    limit: limit / 2,
    timestamp
  })
  const allTransfers = [...newer.toReversed(), ...older]
  return allTransfers.map(transferTransform)
}

// export async function transfersByAddressesLatest({
//   limit,
//   addresses
// }: {
//   limit: number
//   addresses: Array<string>
// }): TransfersReturnType {
//   const { data } = await request(URLS().GRAPHQL, transfersByAddressesLatestQuery, {
//     limit,
//     addresses
//   })
//   return data.map(transferTransform)
// }

// export async function transfersByAddressesTimestamp({
//   limit,
//   addresses,
//   timestamp
// }: {
//   limit: number
//   timestamp: string
//   addresses: Array<string>
// }): TransfersReturnType {
//   const { older, newer } = await request(URLS().GRAPHQL, transfersByAddressesTimestampQuery, {
//     limit: limit / 2,
//     timestamp,
//     addresses
//   })

//   const allTransfers = [...newer.toReversed(), ...older]
//   return allTransfers.map(transferTransform)
// }
//
// todo: fix this awful naming

export const transfersQuery = (
  _normalizedAddresses: Array<string> | null,
  timestamp: Readable<string | null>,
  pageSize: number
) =>
  createQuery(
    derived([timestamp], ([$timestamp]) =>
      // normalizedAddresses
      //   ? $timestamp
      //     ? {
      //         queryKey: ["transfers", $timestamp, ...normalizedAddresses],
      //         refetchOnMount: false,
      //         refetchOnReconnect: false,
      //         placeholderData: keepPreviousData,
      //         staleTime: Number.POSITIVE_INFINITY,
      //         queryFn: async () =>
      //           await transfersByAddressesTimestamp({
      //             limit: pageSize,
      //             timestamp: $timestamp as string,
      //             addresses: normalizedAddresses
      //           })
      //       }
      //     : {
      //         queryKey: ["transfers", "latest", ...normalizedAddresses],
      //         refetchOnMount: true,
      //         placeholderData: keepPreviousData,
      //         refetchOnReconnect: true,
      //         refetchInterval: () => 5_000,
      //         queryFn: async () =>
      //           await transfersByAddressesLatest({
      //             limit: pageSize,
      //             addresses: normalizedAddresses
      //           })
      //       }
      //   :

      $timestamp
        ? {
            queryKey: ["transfers", $timestamp],
            refetchOnMount: false,
            refetchOnReconnect: false,
            placeholderData: keepPreviousData,
            staleTime: Number.POSITIVE_INFINITY,
            queryFn: async () =>
              await transfersTimestamp({
                timestamp: $timestamp as string, // otherwise its disabled
                limit: pageSize
              })
          }
        : {
            queryKey: ["transfers", "latest"],
            refetchOnMount: true,
            placeholderData: keepPreviousData,
            refetchOnReconnect: true,
            refetchInterval: () => 5_000,
            queryFn: async () => await transfersLatest({ limit: pageSize })
          }
    )
  )
