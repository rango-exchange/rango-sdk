import React, { useState } from 'react'
import { Button, LiquiditySourcesSelector, Modal } from '@rango-dev/ui'
import { SwapperMeta } from 'rango-sdk'

interface PropTypes {
  swappers: SwapperMeta[]
  disabledLiquiditySources: string[]
  loading: boolean
  toggleLiquiditySource: (name: string) => void
  setDisabledLiquiditySources: React.Dispatch<React.SetStateAction<string[]>>
}
export function LiquiditySources({
  swappers,
  toggleLiquiditySource,
  setDisabledLiquiditySources,
  loading,
  disabledLiquiditySources,
}: PropTypes) {
  const [open, setOpen] = useState(false)
  const uniqueSwappersGroups: Array<{
    title: string
    logo: string
    type: 'BRIDGE' | 'AGGREGATOR' | 'DEX'
    selected: boolean
  }> = []
  Array.from(new Set(swappers.map((s) => s.swapperGroup)))
    .map((swapperGroup) => {
      return swappers.find((s) => s.swapperGroup === swapperGroup)
    })
    .find((s) => {
      if (s) {
        for (const type of s.types) {
          uniqueSwappersGroups.push({
            title: s.swapperGroup,
            logo: s.logo,
            type,
            selected: !disabledLiquiditySources.includes(s.swapperGroup),
          })
        }
      }
    })

    console.log('uniqueSwappersGroups')
    console.log(uniqueSwappersGroups)
  const toggleAllLiquiditySources = () => {
    if (swappers.length - disabledLiquiditySources.length === 0) {
      setDisabledLiquiditySources([])
    } else {
      const allSwappers = swappers.map((swapper) => swapper.swapperGroup)
      setDisabledLiquiditySources(allSwappers)
    }
  }

  return (
    <>
      <Button
        loading={loading}
        variant="outlined"
        type="primary"
        size="small"
        onClick={() => setOpen(true)}
      >
        Liquidity Sources
      </Button>
      <Modal
        onClose={() => setOpen(false)}
        open={open}
        action={
          <Button
            type="primary"
            variant="ghost"
            onClick={toggleAllLiquiditySources}
          >
            {swappers.length - disabledLiquiditySources.length === 0
              ? 'Select All'
              : 'Clear All'}
          </Button>
        }
        content={
          <LiquiditySourcesSelector
            listContainerStyle={{ height: 'auto', paddingBottom: 20 }}
            list={uniqueSwappersGroups}
            hasHeader={false}
            onChange={(liquiditySource) =>
              toggleLiquiditySource(liquiditySource.title)
            }
            loadingStatus={"success"}
          />
        }
        title="Liquidity Sources"
        containerStyle={{ width: '560px', height: '625px' }}
      />
    </>
  )
}
