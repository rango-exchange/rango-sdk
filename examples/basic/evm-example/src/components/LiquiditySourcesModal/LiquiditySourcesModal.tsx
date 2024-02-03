import { Button, LiquiditySourcesSelector, Modal } from '@rango-dev/ui'
import React from 'react'
import { useMeta } from '../../hooks/useMeta'

const LiquiditySourcesModal = ({
  open,
  handleClose,
  disabledLiquiditySources,
  setDisabledLiquiditySources,
}: {
  open: boolean
  handleClose: () => void
  disabledLiquiditySources: string[]
  setDisabledLiquiditySources: (disabledLiquiditySources: string[]) => void
}) => {
  const { meta } = useMeta()

  if (!meta) return null

  const uniqueSwappersGroups: Array<{
    title: string
    logo: string
    type: 'BRIDGE' | 'AGGREGATOR' | 'DEX'
    selected: boolean
  }> = []
  Array.from(new Set(meta.swappers.map((s) => s.swapperGroup)))
    .map((swapperGroup) => {
      return meta.swappers.find((s) => s.swapperGroup === swapperGroup)
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

  const toggleAllLiquiditySources = () => {
    if (meta.swappers.length - disabledLiquiditySources.length === 0) {
      setDisabledLiquiditySources([])
    } else {
      const allSwappers = meta.swappers.map((swapper) => swapper.swapperGroup)
      setDisabledLiquiditySources(allSwappers)
    }
  }

  const toggleLiquiditySource = (name: string) => {
    const result = disabledLiquiditySources.includes(name)
      ? disabledLiquiditySources.filter(
          (liquiditySource) => liquiditySource !== name
        )
      : disabledLiquiditySources.concat(name)
    setDisabledLiquiditySources(result)
  }

  return (
    <Modal
      onClose={handleClose}
      open={open}
      action={
        <Button
          type="primary"
          variant="ghost"
          onClick={toggleAllLiquiditySources}
        >
          {meta.swappers.length - disabledLiquiditySources.length === 0
            ? 'Select All'
            : 'Clear All'}
        </Button>
      }
      content={
        <LiquiditySourcesSelector
          loadingStatus="success"
          listContainerStyle={{ height: 'auto', paddingBottom: 20 }}
          list={uniqueSwappersGroups}
          hasHeader={false}
          onChange={(liquiditySource) =>
            toggleLiquiditySource(liquiditySource.title)
          }
        />
      }
      title="Liquidity Sources"
      containerStyle={{ width: '560px', height: '625px' }}
    />
  )
}

export default LiquiditySourcesModal
