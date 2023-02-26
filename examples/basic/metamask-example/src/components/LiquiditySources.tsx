import React from 'react'
import { Button, LiquiditySourcesSelector, Modal, styled } from '@rangodev/ui'
import { SwapperMeta } from 'rango-sdk-basic/lib'

import { useState } from 'react'

interface PropTypes {
  swappers: SwapperMeta[]
  disabledLiquiditySources: string[]
  loading: boolean
  toggleLiquiditySource: (name: string) => void
}

const Container = styled('div', {
  display: 'flex',
  justifyContent: 'flex-end',
})

export function LiquiditySources({
  swappers,
  toggleLiquiditySource,
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
  return (
    <Container>
      <Button
        loading={loading}
        variant="outlined"
        type="primary"
        onClick={() => setOpen(true)}
      >
        Select Liquidity Sources
      </Button>
      <Modal
        onClose={() => setOpen(false)}
        open={open}
        content={
          <LiquiditySourcesSelector
            listContainerStyle={{ height: 'auto', paddingBottom: 20 }}
            list={uniqueSwappersGroups}
            onChange={(liquiditySource) =>
              toggleLiquiditySource(liquiditySource.title)
            }
            hasHeader={false}
          />
        }
        title="Liquidity Sources"
        containerStyle={{ width: '560px', height: '610px' }}
        contentStyle={{ overflowY: 'hidden' }}
      />
    </Container>
  )
}
