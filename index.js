var app = angular.module('app',['ui.bootstrap'])
	,averageBlockTime = 12.7
	,blocksPerRound = 6800
	,LottoAbi = [{"constant":true,"inputs":[{"name":"roundIndex","type":"uint256"}],"name":"getPot","outputs":[{"name":"","type":"uint256"}],"type":"function"},{"constant":true,"inputs":[{"name":"roundIndex","type":"uint256"},{"name":"buyer","type":"address"}],"name":"getTicketsCountByBuyer","outputs":[{"name":"","type":"uint256"}],"type":"function"},{"constant":true,"inputs":[{"name":"roundIndex","type":"uint256"},{"name":"subpotIndex","type":"uint256"}],"name":"getIsCashed","outputs":[{"name":"","type":"bool"}],"type":"function"},{"constant":true,"inputs":[{"name":"roundIndex","type":"uint256"},{"name":"buyer","type":"address"}],"name":"getBuyers","outputs":[{"name":"","type":"address[]"}],"type":"function"},{"constant":true,"inputs":[{"name":"roundIndex","type":"uint256"}],"name":"getSubpotsCount","outputs":[{"name":"","type":"uint256"}],"type":"function"},{"constant":true,"inputs":[{"name":"roundIndex","type":"uint256"},{"name":"subpotIndex","type":"uint256"}],"name":"calculateWinner","outputs":[{"name":"","type":"address"}],"type":"function"},{"constant":true,"inputs":[],"name":"getRoundIndex","outputs":[{"name":"","type":"uint256"}],"type":"function"},{"constant":true,"inputs":[{"name":"blockIndex","type":"uint256"}],"name":"getHashOfBlock","outputs":[{"name":"","type":"uint256"}],"type":"function"},{"constant":true,"inputs":[],"name":"getBlocksPerRound","outputs":[{"name":"","type":"uint256"}],"type":"function"},{"constant":true,"inputs":[],"name":"getTicketPrice","outputs":[{"name":"","type":"uint256"}],"type":"function"},{"constant":true,"inputs":[{"name":"roundIndex","type":"uint256"}],"name":"getSubpot","outputs":[{"name":"","type":"uint256"}],"type":"function"},{"constant":false,"inputs":[{"name":"roundIndex","type":"uint256"},{"name":"subpotIndex","type":"uint256"}],"name":"cash","outputs":[],"type":"function"},{"constant":true,"inputs":[{"name":"roundIndex","type":"uint256"},{"name":"subpotIndex","type":"uint256"}],"name":"getDecisionBlockNumber","outputs":[{"name":"","type":"uint256"}],"type":"function"}];LottoContract = web3.eth.contract(LottoAbi);Lotto = LottoContract.at('0x96268285750b282830797f2c43d6ef941cb78596')
	,Lotto = web3.eth.contract(LottoAbi).at('0x539f2912831125c9b86451420bc0d37b219587f9')
	,estimatedGas = 150000

if(!web3.currentProvider)
    web3.setProvider(new web3.providers.HttpProvider("http://localhost:8545"));

app.run(function($rootScope,$interval,$http,$q,$modal){

	$rootScope.tab = 'tickets'
	$rootScope.isLoading = true
	$rootScope.updateRound = function(){
		updateRound()
	}

	function updateLotto(){
		var batch = web3.createBatch()
			,lotto = {blocksPerRound:blocksPerRound}
		
		return $q(function(resolve,reject){

			batch.add(Lotto.getRoundIndex.request(function(error,roundIndex){
				lotto.roundIndex = parseInt(roundIndex)
			}))
			batch.add(Lotto.getTicketPrice.request(function(error,ticketPrice){
				lotto.ticketPrice = ticketPrice
			}))
			batch.add(web3.eth.getBlockNumber.request(function(results,blockNumber){
				lotto.blockNumber = parseInt(blockNumber)
				resolve(lotto)
			}))

			batch.execute()

		}).then(function(lotto){
			$rootScope.lotto = lotto
			$rootScope.blocksLeft = lotto.blocksPerRound-((lotto.blockNumber)%parseInt(lotto.blocksPerRound))
			$rootScope.secondsLeft = $rootScope.blocksLeft*averageBlockTime;
			
		})
	}

	$rootScope.$watch('secondsLeft',function(secondsLeft,oldSecondsLeft){
		if(secondsLeft==oldSecondsLeft) return
		$rootScope.secondsLeftMin = secondsLeft-12
		$rootScope.timeLeft = {
			hours: Math.floor(secondsLeft/(60*60))
			,minutes: Math.floor(secondsLeft/(60))%60
			,seconds: Math.floor(secondsLeft%60)
		}
	})

	$interval(function(){
		if(!$rootScope.secondsLeft || $rootScope.secondsLeft<=$rootScope.secondsLeftMin) return
		$rootScope.secondsLeft--
	},1000)

	function updateRound(){

		return $q(function(resolve,reject){

			var batch = web3.createBatch()
			var round = {
				subpots:[]
				,ticketsCountByBuyer:{}
				,ticketsCount:0
			}
			var roundIndex = $rootScope.roundIndex

			batch.add(Lotto.getSubpotsCount.request(roundIndex,function(results,subpotsCount){

				round.subpotsCount = parseInt(subpotsCount)

				var batch = web3.createBatch()

				for(var subpotIndex = 0; subpotIndex<round.subpotsCount; subpotIndex++){

					var decisionBlockNumber = ((roundIndex+1)*blocksPerRound)+subpotIndex
					var _subpotIndex = subpotIndex

					round.subpots[subpotIndex]={decisionBlockNumber:decisionBlockNumber}

					if($rootScope.lotto.blockNumber<decisionBlockNumber){
						round.subpots[subpotIndex].decisionBlockHash=null
						round.subpots[subpotIndex].winner = null
						round.subpots[subpotIndex].isCashed = null
						continue;
					}

					(function(subpotIndex){
						batch.add(web3.eth.getBlock.request(decisionBlockNumber,function(error,block){
							round.subpots[subpotIndex].decisionBlockHash = 1;
							round.subpots[subpotIndex].decisionBlockHash = block.hash
						}))

						batch.add(Lotto.calculateWinner.request(roundIndex,subpotIndex,function(error,winner){
							round.subpots[subpotIndex].winner = winner
						}))

						batch.add(Lotto.getIsCashed.request(roundIndex,subpotIndex,function(error,isCashed){
							round.subpots[subpotIndex].isCashed = isCashed
						}))
					}(subpotIndex))
				
				}

				batch.add(Lotto.getBuyers.request(roundIndex,function(error,buyers){

					var batch = web3.createBatch()

					buyers.forEach(function(buyer){
						batch.add(Lotto.getTicketsCountByBuyer.request(roundIndex,buyer,function(error,ticketsCount){
							round.ticketsCountByBuyer[buyer]=ticketsCount;
							round.ticketsCount = ticketsCount.plus(round.ticketsCount)
						}))
					})

					batch.add(Lotto.getPot.request(roundIndex,function(error,pot){
						round.pot = parseInt(pot)
					}))

					batch.add(Lotto.getSubpot.request(roundIndex,function(error,subpot){
						round.subpot = subpot
						resolve(round)
					}))

					batch.execute()

				}))

				batch.execute()
			
			}))

			batch.execute()
		
		}).then(function(round){
			$rootScope.round = round
		})
	}

	updateLotto().then(function(){
		var hash = window.location.hash.split('#')[1]
			,hashInt = parseInt(hash)

		if(hashInt>0)
			$rootScope.roundIndex = hashInt
		else
			$rootScope.roundIndex = parseInt($rootScope.lotto.roundIndex)
	}).then(updateRound).then(function(){
		$rootScope.isLoading = false
	})


	$rootScope.$watch('roundIndex',function(roundIndex){
		if(!roundIndex) return;

		$rootScope.isLoading = true
		window.history.replaceState({},'Etherpot - Round '+roundIndex,'#'+roundIndex)
		updateRound().then(function(){
			$rootScope.isLoading = false
		})
	})

	$rootScope.openBuyModal = function(){
		var modalInstance = $modal.open({
	      templateUrl: 'buyModal.html',
	      controller: 'BuyModalController',
	      resolve: {
	      	lotto:function(){
	      		return $rootScope.lotto
	      	},round:function(){
	      		return $rootScope.round
	      	},accounts:function(){
	      		return web3.eth.accounts
	      	},estimatedGas:function(){
	      		return estimatedGas
	      	}
	      }
	    });
	}

	$rootScope.openCashModal = function(roundIndex,subpotIndex){
		var modalInstance = $modal.open({
	      templateUrl: 'cashModal.html',
	      controller: 'CashModalController',
	      resolve: {
	      	accounts:function(){
	      		return web3.eth.accounts
	      	},roundIndex:function(){
	      		return roundIndex
	      	},subpotIndex:function(){
	      		return subpotIndex
	      	}
	      }
	    });
	}


	$interval(function(){
		updateLotto().then(updateRound)
	},10000)

})

app.controller('BuyModalController',function($scope,$q,$modalInstance,lotto,round,accounts,estimatedGas,$modal){

	$scope.ticketsCount = 1
	$scope.accounts = accounts
	$scope.account = accounts[0]

	$scope.$watch('account',function(){
		$scope.accountBalanceInEther = web3.fromWei(web3.eth.getBalance($scope.account),'ether')
	})
	
	$scope.$watch('ticketsCount',function(){
		$scope.ticketsPrice = $scope.ticketsCount*.1
		$scope.ticketsCost = lotto.ticketPrice.times($scope.ticketsCount)
		$scope.ticketsCostInEther = web3.fromWei($scope.ticketsCost,'ether')

		$scope.estimatedGas = estimatedGas
		$scope.estimatedGasCost = web3.eth.gasPrice.times($scope.estimatedGas)
		$scope.estimatedGasCostInEther = web3.fromWei($scope.estimatedGasCost,'ether')

		$scope.totalCostInEther = $scope.estimatedGasCostInEther.plus($scope.ticketsCostInEther)
	})

	$scope.$watch('[account,ticketsCount]',function(){
		$scope.isEnoughAvailable = $scope.accountBalanceInEther.greaterThanOrEqualTo($scope.totalCostInEther)
	})

	$scope.cancel = function(){
		$modalInstance.close();
	}

	$scope.buy = function(){

		$q(function(resolve,reject){
			var transaction = {
				from:$scope.account
				,to:Lotto.address
				,value:$scope.ticketsCost
				,gas:$scope.estimatedGas
			}

			var doContinue = confirm('It may take up to 2 minutes to complete and verify the purchase. Continue?')

			if(!doContinue)
				return

			web3.eth.sendTransaction(transaction,function(error,txHex){
				if(error)
					return alert(error.message)

				$modalInstance.close();

				$modal.open({
			      	templateUrl: 'waitModal.html',
			      	controller: 'WaitModalController',
			      	backdrop: 'static',
			      	keyboard: false,
			      	resolve: {
				      	txHex:function(){
				      		return txHex
				      	}
			      	}
			    });

			})
		})
	}
})

app.controller('CashModalController',function($scope,$q,$modalInstance,roundIndex,subpotIndex,accounts,$modal){

	$scope.accounts = accounts
	$scope.account = accounts[0]
	$scope.roundIndex = roundIndex
	$scope.subpotIndex = subpotIndex

	$scope.$watch('account',function(){
		$scope.accountBalanceInEther = web3.fromWei(web3.eth.getBalance($scope.account),'ether')
	})

	var estimatedGas = Lotto.cash.estimateGas(roundIndex,subpotIndex)

	$scope.estimatedGasCostInEther = web3.fromWei(web3.eth.gasPrice.times(estimatedGas),'ether')
	
	$scope.$watch('[account]',function(){
		$scope.isEnoughAvailable = $scope.accountBalanceInEther.greaterThanOrEqualTo($scope.estimatedGasCostInEther)
	})

	$scope.cancel = function(){
		$modalInstance.close();
	}

	$scope.cash = function(){

		var doContinue = confirm('It may take up to 2 minutes to complete and verify. Continue?')

		if(!doContinue)
				return
		Lotto.cash(roundIndex,subpotIndex,{from:$scope.account},function(error,txHex){
			if(error)
				return alert(error.message)

			$modalInstance.close();

			$modal.open({
		      	templateUrl: 'waitModal.html',
		      	controller: 'WaitModalController',
		      	backdrop: 'static',
		      	keyboard: false,
		      	resolve: {
			      	txHex:function(){
			      		return txHex
			      	}
		      	}
		    });
		})
	}
})

app.controller('WaitModalController',function($scope,$interval,$modalInstance,$rootScope,txHex){
	$scope.txHex = txHex

	var interval = $interval(function(){
		var blockNumber = web3.eth.getTransaction(txHex).blockNumber
		if(!blockNumber) return

		$modalInstance.close()
		$interval.cancel(interval)

		alert('Success! Transaction '+txHex+' included on block '+blockNumber+'. Copy this down for your records.')
	
		$rootScope.updateRound()

	},1000)
})