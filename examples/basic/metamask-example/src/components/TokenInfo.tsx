import {
  AngleDownIcon,
  BlockchainSelector,
  Button,
  Modal,
  styled,
  TextField,
  TokenSelector,
  Typography,
} from '@rangodev/ui'
import { isEvmBlockchain } from 'rango-sdk'
import { BlockchainMeta, Token } from 'rango-sdk-basic/lib'

import { useState } from 'react'

interface PropTypes {
  type: 'From' | 'To'
  chain: BlockchainMeta | null
  token: Token | null
  loading: boolean
  blockchains: BlockchainMeta[]
  tokens: Token[]
  setChain: React.Dispatch<React.SetStateAction<BlockchainMeta | null>>
  setToken: React.Dispatch<React.SetStateAction<Token | null>>
  setInputAmount?: React.Dispatch<React.SetStateAction<string>>
}

const Box = styled('div', {
  padding: '$16',
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  textAlign: 'left',
})

const Container = styled('div', {
  boxSizing: 'border-box',
  backgroundColor: '$neutrals300',
  borderRadius: '$5',
  padding: '$8',
  display: 'flex',
  width: '100%',
})

const StyledImage = styled('img', {
  width: '24px',
})

const ImagePlaceholder = styled('span', {
  width: '24px',
  height: '24px',
  backgroundColor: '$neutrals300',
  borderRadius: '99999px',
})

export function TokenInfo(props: PropTypes) {
  const {
    type,
    chain,
    token,
    loading,
    blockchains,
    tokens,
    setToken,
    setChain,
    setInputAmount,
  } = props
  const [modal, setModal] = useState({
    open: false,
    isChain: false,
    isToken: false,
  })

  return (
    <Box>
      <div>
        <Typography variant="body2">{type}</Typography>
      </div>
      <Container>
        <Button
          variant="outlined"
          loading={loading}
          prefix={
            chain ? <StyledImage src={chain.logo} /> : <ImagePlaceholder />
          }
          onClick={() =>
            setModal((prev) => ({
              open: !prev.open,
              isChain: true,
              isToken: false,
            }))
          }
          suffix={<AngleDownIcon />}
          align="start"
          size="large"
          style={{ marginRight: '.5rem' }}
        >
          {chain ? chain.name : 'Chain'}
        </Button>
        <Button
          variant="outlined"
          loading={loading}
          disabled={!chain}
          onClick={() =>
            setModal((prev) => ({
              open: !prev.open,
              isChain: false,
              isToken: true,
            }))
          }
          prefix={
            token ? <StyledImage src={token.image} /> : <ImagePlaceholder />
          }
          suffix={<AngleDownIcon />}
          size="large"
          align="start"
          style={{ marginRight: '.5rem' }}
        >
          {token ? token.symbol : 'Token'}
        </Button>
        {type === 'From' && (
          <TextField
            type="number"
            onChange={(e: any) =>
              setInputAmount && setInputAmount(e.target.value)
            }
            size="large"
            style={{
              width: '70%',
              position: 'relative',
              backgroundColor: '$background !important',
            }}
          />
        )}
      </Container>
      <Modal
        open={modal.open}
        onClose={() =>
          setModal((prev) => ({
            ...prev,
            open: false,
          }))
        }
        content={
          modal.isChain ? (
            <BlockchainSelector
              list={
                blockchains.filter((chain: any) =>
                  isEvmBlockchain(chain)
                ) as any
              }
              hasHeader={false}
              selected={chain as any}
              onChange={(chain: any) => setChain(chain)}
              loadingStatus="success"
              listContainerStyle={{ height: 'auto', paddingBottom: 20 }}
            />
          ) : (
            modal.isToken && (
              <TokenSelector
                list={
                  tokens
                    ? (tokens.filter(
                        (token) => token.blockchain === chain?.name
                      ) as any)
                    : []
                }
                hasHeader={false}
                onChange={(token: any) => setToken(token)}
                selected={token as any}
              />
            )
          )
        }
        title={`Select ${type === 'From' ? 'Source' : 'Destination'} Network`}
        containerStyle={{ width: '560px', height: '610px' }}
        contentStyle={{ overflowY: 'hidden' }}
      />
    </Box>
  )
}
