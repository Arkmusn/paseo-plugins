import { useRpc } from "@getpaseo/plugin/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { marketCatalogRpc, marketInstalledRpc } from "../shared/rpc";

export const CATALOG_KEY = ["paseo-market-catalog"] as const;
export const INSTALLED_KEY = ["paseo-market-installed"] as const;

export function useCatalogQuery() {
  const rpc = useRpc(marketCatalogRpc);
  return useQuery({
    queryKey: CATALOG_KEY,
    queryFn: () => rpc({ force: false }),
    staleTime: 60_000,
  });
}

export function useInstalledQuery() {
  const rpc = useRpc(marketInstalledRpc);
  return useQuery({
    queryKey: INSTALLED_KEY,
    queryFn: () => rpc({}),
    staleTime: 30_000,
  });
}

export function useRefreshCatalog() {
  const rpc = useRpc(marketCatalogRpc);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => rpc({ force: true }),
    onSuccess: (data) => {
      queryClient.setQueryData(CATALOG_KEY, data);
    },
  });
}

/** 安装/卸载/启停后让目录与已安装两块数据一起失效。 */
export function useInvalidateMarket() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: CATALOG_KEY });
    void queryClient.invalidateQueries({ queryKey: INSTALLED_KEY });
  };
}